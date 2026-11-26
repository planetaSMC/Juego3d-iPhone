//
//  HeadTrackingBridge.swift
//  RASMATIC VR
//
//  Seguimiento real de orientación de la cabeza con Core Motion.
//
//  Por qué Core Motion y no ARKit
//  ------------------------------
//  El objetivo es orientación de la cabeza (3DoF: yaw, pitch y roll) dentro
//  de unas VR Box. Core Motion entrega esa orientación con el giroscopio y el
//  acelerómetro, sin cámara, con baja latencia y sin exigir un iPhone
//  compatible con ARKit. ARKit aporta 6DoF y seguimiento posicional, pero
//  necesita cámara, más batería y no está disponible en todos los modelos;
//  para este juego sería una dependencia innecesaria.
//
//  Permisos
//  --------
//  No se usa la cámara. El Info.plist de RASMATIC VR declara
//  NSMotionUsageDescription para que iOS explique el acceso al movimiento.
//  Si el dispositivo no tiene giroscopio o no llegan muestras, el JavaScript
//  muestra "SIN SENSORES" / "SIN RESPUESTA" y NO simula movimiento.
//
//  Transporte
//  ----------
//  A 60 Hz se envía la orientación al JavaScript por la misma vía que el
//  mando (evaluateJavaScript), sin bloquear el hilo principal:
//
//      window.RasmaticNativeHeadTracking.raw(yaw, pitch, roll)
//      window.RasmaticNativeHeadTracking.status(disponible, nombre)
//
//  yaw/pitch/roll van en radianes. El JavaScript calcula la diferencia con
//  el punto de recentrado, aplica sensibilidad y suavizado, y la usa como
//  offset de render. La cámara y el estado del juego nunca se modifican.
//

import CoreMotion
import Foundation
import WebKit

final class HeadTrackingBridge {

    /// Frecuencia de muestreo. 60 Hz alcanza para VR y no satura el puente.
    private static let interval: TimeInterval = 1.0 / 60.0

    private weak var webView: WKWebView?
    private let motion = CMMotionManager()
    private var running = false
    private var lastOrientation = ""
    private var lastStatus = ""

    init(webView: WKWebView) {
        self.webView = webView
    }

    deinit {
        stop()
    }

    // MARK: - Ciclo de vida

    /// Elige un marco de referencia que el dispositivo realmente soporte.
    ///
    /// `CMAttitudeReferenceFrame` solo tiene cuatro valores válidos:
    /// `.xArbitraryZVertical`, `.xArbitraryCorrectedZVertical`,
    /// `.xmagneticNorthZVertical` y `.xTrueNorthZVertical`.
    /// No existe un valor genérico sin sufijo: hay que usar uno de esos
    /// cuatro y comprobar antes que el equipo lo soporte.
    ///
    /// Se prefiere el eje Z arbitrario (sin magnetómetro): es el más estable
    /// en interiores y no salta por interferencias metálicas. Si el equipo no
    /// lo ofrece, se acepta el corregido o uno magnético; si no hay ninguno,
    /// se devuelve `nil` y no se inicia una sesión inválida.
    private static func referenceFrame(
        available: CMAttitudeReferenceFrame
    ) -> CMAttitudeReferenceFrame? {
        let preferred: [CMAttitudeReferenceFrame] = [
            .xArbitraryZVertical,
            .xArbitraryCorrectedZVertical,
            .xmagneticNorthZVertical,
            .xTrueNorthZVertical
        ]
        return preferred.first { available.contains($0) }
    }

    func start() {
        guard !running else { return }
        guard motion.isDeviceMotionAvailable else {
            sendStatus(available: false, name: "Sin giroscopio")
            return
        }
        guard let frame = HeadTrackingBridge.referenceFrame(
            available: CMMotionManager.availableAttitudeReferenceFrames()
        ) else {
            // El equipo tiene device motion pero ningún marco utilizable:
            // se informa y no se arranca una sesión inválida.
            sendStatus(available: false, name: "Sin marco de referencia")
            return
        }

        running = true
        lastOrientation = ""
        lastStatus = ""

        motion.deviceMotionUpdateInterval = HeadTrackingBridge.interval
        motion.startDeviceMotionUpdates(using: frame, to: .main) { [weak self] data, error in
            guard let self = self else { return }
            if let error = error {
                self.sendStatus(available: false, name: error.localizedDescription)
                return
            }
            guard let attitude = data?.attitude else { return }
            self.sendOrientation(yaw: attitude.yaw,
                                 pitch: attitude.pitch,
                                 roll: attitude.roll)
        }

        sendStatus(available: true, name: "Core Motion")
    }

    func stop() {
        guard running else { return }
        running = false
        motion.stopDeviceMotionUpdates()
    }

    /// La página terminó de cargar: se reanuda y se reanuncia el sensor.
    func webViewDidLoad() {
        if running {
            lastStatus = ""
            lastOrientation = ""
            sendStatus(available: true, name: "Core Motion")
        }
    }

    // MARK: - Envío al JavaScript

    private func sendOrientation(yaw: Double, pitch: Double, roll: Double) {
        // Milirradianes: resolución ~0,06° y compare entero estable.
        let y = Int((yaw * 1000).rounded())
        let p = Int((pitch * 1000).rounded())
        let r = Int((roll * 1000).rounded())
        let key = "\(y),\(p),\(r)"
        if key == lastOrientation { return }
        lastOrientation = key
        evaluate("window.RasmaticNativeHeadTracking&&RasmaticNativeHeadTracking.raw(" +
                 "\(yaw),\(pitch),\(roll))")
    }

    private func sendStatus(available: Bool, name: String) {
        let key = "\(available ? 1 : 0)|\(name)"
        if key == lastStatus { return }
        lastStatus = key
        evaluate("window.RasmaticNativeHeadTracking&&RasmaticNativeHeadTracking.status(" +
                 "\(available ? 1 : 0),\(HeadTrackingBridge.jsString(name)))")
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
    private static func jsString(_ value: String) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: [value]),
              var text = String(data: data, encoding: .utf8) else {
            return "\"\""
        }
        if text.hasPrefix("[") { text.removeFirst() }
        if text.hasSuffix("]") { text.removeLast() }
        return text
    }
}
