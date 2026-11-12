//
//  GamepadBridge.swift
//  RASMATIC · Lugar 3D
//
//  Puente nativo del mando (GameController) -> JavaScript.
//
//  Por que existe
//  --------------
//  La Gamepad API de WKWebView no siempre entrega los mandos Bluetooth de
//  PlayStation / Xbox (WebKit los lista vacios en algunas versiones de iOS).
//  Este puente lee el mando con el framework GameController de Apple y lo
//  entrega al juego por la MISMA superficie que ya usa el juego:
//
//      window.RasmaticInput.gamepad({mx,my,lx,ly,run})
//      window.RasmaticInput.press('interact'|'pause'|'menu'|'home'|'dock')
//      window.RasmaticInput.gamepadStatus(conectado, nombre)
//
//  Asi no se duplica la logica de la partida ni el mapeo: el JavaScript
//  (web/ios/ios-bridge.js) recibe los valores y hace lo mismo que con la
//  Gamepad API.
//
//  Normalizacion
//  -------------
//  GameController ya normaliza PS4 (DualShock), PS5 (DualSense), Xbox y los
//  mandos MFi a los mismos botones:
//
//      buttonA = Cruz / A / boton A
//      buttonB = Circulo / B
//      buttonX = Cuadrado / X
//      buttonY = Triangulo / Y
//      leftShoulder = L1/LB     rightShoulder = R1/RB
//      leftTrigger  = L2/LT     rightTrigger  = R2/RT
//      buttonMenu   = Options/Menu
//      buttonOptions= Create/View
//      buttonHome   = PS/Xbox (iOS puede reservarlo)
//
//  El stick izquierdo mueve, el derecho mira, L1/L2 corre, A/R1/R2 interactua,
//  B/Start es "atras", X es menu, Y es inicio y Select es dock.
//
//  Frecuencia: 60 Hz, y solo se cruza al JavaScript cuando el estado cambia
//  (los valores se envian en milesimas enteras para no depender del idioma).
//

import Foundation
import GameController
import WebKit

final class GamepadBridge {

    /// Zona muerta, igual que GamepadManager.DEADZONE en Android.
    private static let deadzone: Float = 0.18
    /// Un gatillo cuenta como pulsado a partir de este valor (Android: 0.5).
    private static let triggerOn: Float = 0.5

    private weak var webView: WKWebView?
    private var timer: Timer?
    private var observers: [NSObjectProtocol] = []
    private var activeController: GCController?
    private var previous: [String: Bool] = [:]
    private var lastState = ""
    private var lastStatus = ""

    init(webView: WKWebView) {
        self.webView = webView
    }

    deinit {
        stop()
    }

    // MARK: - Ciclo de vida

    /// Arranca el sondeo. Se puede llamar varias veces: no duplica el timer.
    func start() {
        guard timer == nil else { return }
        observeControllers()
        let timer = Timer(timeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in
            self?.tick()
        }
        // .common sigue funcionando durante scrolls y transiciones.
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer
        refreshController()
    }

    /// Detiene el sondeo y avisa al juego que no hay mando.
    func stop() {
        timer?.invalidate()
        timer = nil
        for observer in observers {
            NotificationCenter.default.removeObserver(observer)
        }
        observers.removeAll()
        previous.removeAll()
        lastState = ""
        lastStatus = ""
        if activeController != nil {
            activeController = nil
            sendState(0, 0, 0, 0, false, force: true)
            sendStatus(connected: false, name: "")
        }
    }

    /// La pagina termino de cargar: se vuelve a anunciar el mando actual.
    /// `force` es necesario porque el mando pudo conectarse antes de que el
    /// JavaScript existiera: el aviso enviado en `start()` se perdio y el
    /// estado no debe quedar como "ya enviado".
    func webViewDidLoad() {
        lastStatus = ""
        lastState = ""
        refreshController(force: true)
    }

    // MARK: - Deteccion

    private func observeControllers() {
        guard observers.isEmpty else { return }
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: .GCControllerDidConnect,
                                            object: nil,
                                            queue: .main) { [weak self] _ in
            self?.refreshController()
        })
        observers.append(center.addObserver(forName: .GCControllerDidDisconnect,
                                            object: nil,
                                            queue: .main) { [weak self] _ in
            self?.refreshController()
        })
    }

    private func refreshController(force: Bool = false) {
        var chosen: GCController?

        // 1) El mando "actual" (el ultimo que uso el usuario), si tiene sticks.
        if #available(iOS 14.0, *) {
            if let current = GCController.current, current.extendedGamepad != nil {
                chosen = current
            }
        }
        // 2) Cualquier mando extendido (PS4, PS5, Xbox, MFi).
        if chosen == nil {
            chosen = GCController.controllers().first { $0.extendedGamepad != nil }
        }
        // 3) Respaldo: micro gamepad (Siri Remote y similares).
        if chosen == nil {
            chosen = GCController.controllers().first { $0.microGamepad != nil }
        }

        guard force || chosen !== activeController else { return }

        activeController = chosen
        previous.removeAll()
        lastState = ""

        if let controller = chosen {
            sendStatus(connected: true, name: displayName(controller))
        } else {
            sendState(0, 0, 0, 0, false, force: true)
            sendStatus(connected: false, name: "")
        }
    }

    private func displayName(_ controller: GCController) -> String {
        if let vendor = controller.vendorName, !vendor.isEmpty {
            return vendor
        }
        return controller.productCategory.isEmpty ? "Mando" : controller.productCategory
    }

    // MARK: - Lectura

    private func tick() {
        guard let controller = activeController else { return }
        if let pad = controller.extendedGamepad {
            updateExtended(pad)
        } else if let pad = controller.microGamepad {
            updateMicro(pad)
        }
    }

    private func updateExtended(_ pad: GCExtendedGamepad) {
        var mx = dead(pad.leftThumbstick.xAxis.value)
        var my = dead(pad.leftThumbstick.yAxis.value)
        if pad.dpad.right.isPressed { mx += 1 }
        if pad.dpad.left.isPressed { mx -= 1 }
        if pad.dpad.up.isPressed { my += 1 }
        if pad.dpad.down.isPressed { my -= 1 }

        let lx = dead(pad.rightThumbstick.xAxis.value)
        let ly = dead(pad.rightThumbstick.yAxis.value)
        let run = pad.leftShoulder.isPressed ||
            pad.leftTrigger.value >= GamepadBridge.triggerOn

        sendState(clamp(mx), clamp(my), lx, ly, run)

        edge("a", pad.buttonA.isPressed, "interact")
        edge("r1", pad.rightShoulder.isPressed, "interact")
        edge("r2", pad.rightTrigger.value >= GamepadBridge.triggerOn, "interact")
        edge("b", pad.buttonB.isPressed, "pause")
        edge("start", pad.buttonMenu.isPressed, "pause")
        edge("x", pad.buttonX.isPressed, "menu")
        edge("y", pad.buttonY.isPressed, "home")
        edge("select", pad.buttonOptions?.isPressed ?? false, "dock")
    }

    private func updateMicro(_ pad: GCMicroGamepad) {
        let mx = clamp(Double(pad.dpad.xAxis.value))
        let my = clamp(Double(pad.dpad.yAxis.value))
        // Un micro mando no tiene gatillo ni boton de correr: se camina.
        // X se reserva para pausa (usarlo tambien como "correr" hacia que
        // una misma pulsacion corriera y pausara a la vez).
        sendState(mx, my, 0, 0, false)
        edge("a", pad.buttonA.isPressed, "interact")
        edge("x", pad.buttonX.isPressed, "pause")
    }

    private func dead(_ value: Float) -> Double {
        return abs(value) < GamepadBridge.deadzone ? 0 : Double(value)
    }

    private func clamp(_ value: Double) -> Double {
        return min(1, max(-1, value))
    }

    // MARK: - Envio al JavaScript

    private func edge(_ key: String, _ down: Bool, _ action: String) {
        if down && previous[key] != true {
            sendPress(action)
        }
        previous[key] = down
    }

    /// Se envia solo cuando cambia: el juego ya ignora repeticiones, pero
    /// cruzar el puente 60 veces por segundo con el mismo valor es gasto puro.
    private func sendState(_ mx: Double, _ my: Double, _ lx: Double, _ ly: Double,
                           _ run: Bool, force: Bool = false) {
        let milli = { (value: Double) -> Int in Int((value * 1000).rounded()) }
        let key = "\(milli(mx)),\(milli(my)),\(milli(lx)),\(milli(ly)),\(run ? 1 : 0)"
        if !force && key == lastState { return }
        lastState = key
        evaluate("window.RasmaticNativeGamepad&&RasmaticNativeGamepad.raw('\(key)')")
    }

    private func sendPress(_ action: String) {
        evaluate("window.RasmaticNativeGamepad&&RasmaticNativeGamepad.press(\(jsString(action)))")
    }

    private func sendStatus(connected: Bool, name: String) {
        let key = "\(connected ? 1 : 0)|\(name)"
        if key == lastStatus { return }
        lastStatus = key
        evaluate("window.RasmaticNativeGamepad&&RasmaticNativeGamepad.status(\(connected ? 1 : 0),\(jsString(name)))")
    }

    private func evaluate(_ script: String) {
        guard let webView = webView else { return }
        if Thread.isMainThread {
            webView.evaluateJavaScript(script, completionHandler: nil)
        } else {
            DispatchQueue.main.async {
                webView.evaluateJavaScript(script, completionHandler: nil)
            }
        }
    }

    /// Convierte un String de Swift en un literal JavaScript seguro.
    private func jsString(_ value: String) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: [value]),
              var text = String(data: data, encoding: .utf8) else {
            return "\"\""
        }
        if text.hasPrefix("[") { text.removeFirst() }
        if text.hasSuffix("]") { text.removeLast() }
        return text
    }
}
