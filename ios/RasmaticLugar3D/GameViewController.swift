//
//  GameViewController.swift
//  RASMATIC · Lugar 3D
//
//  Muestra el juego (HTML + WebGL) dentro de un WKWebView.
//
//  Por que un esquema propio (rasmatic://) y no file://
//  ---------------------------------------------------
//  file:// obliga a WKWebView a relajar la politica de origen: las fuentes
//  (@font-face) y algunos recursos se bloquean por CORS y la escena queda
//  sin tipografia. Con WKURLSchemeHandler los archivos se sirven desde el
//  bundle como si fueran un sitio normal: mismo origen, mismo MIME, cero
//  diferencias con Safari. Los archivos se leen del directorio `www` que
//  copia la fase de recursos (folder reference del proyecto).
//

import UIKit
import WebKit

final class GameViewController: UIViewController {

    /// Esquema interno. Debe coincidir con el que registra `makeWebView()`.
    private static let scheme = "rasmatic"
    private static let host = "app"
    private static let startURL = URL(string: "rasmatic://app/index.html")!

    private var webView: WKWebView!
    private var schemeHandler: BundleSchemeHandler?
    private var gamepad: GamepadBridge?

    // MARK: - Ciclo de vida

    override func viewDidLoad() {
        super.viewDidLoad()

        view.backgroundColor = UIColor(red: 0.639, green: 0.698, blue: 0.780, alpha: 1) // #a3b2c7
        webView = makeWebView()
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        // Mando Bluetooth: se lee con GameController (no con la Gamepad API,
        // que en WKWebView no siempre ve los mandos de PS/Xbox).
        let bridge = GamepadBridge(webView: webView)
        gamepad = bridge
        bridge.start()

        webView.load(URLRequest(url: Self.startURL))
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        // Mantiene el mando/teclado conectado y el WebView como primer respondedor.
        becomeFirstResponder()
        webView.becomeFirstResponder()
        gamepad?.start()
        // Igual que FLAG_KEEP_SCREEN_ON en Android: la pantalla no se apaga
        // durante la partida.
        UIApplication.shared.isIdleTimerDisabled = true
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        UIApplication.shared.isIdleTimerDisabled = false
        gamepad?.stop()
    }

    // Juego inmersivo: sin barra de estado ni indicador de inicio.
    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }
    override var canBecomeFirstResponder: Bool { true }

    override func didReceiveMemoryWarning() {
        super.didReceiveMemoryWarning()
        // El WebView se reconstruye solo si iOS descarta su proceso; no se
        // libera nada a mano para no perder la partida en curso.
    }

    // MARK: - WKWebView

    private func makeWebView() -> WKWebView {
        let config = WKWebViewConfiguration()

        // El handler se retiene en esta propiedad: WKWebView no lo hace.
        let handler = BundleSchemeHandler(root: BundleSchemeHandler.bundleRoot())
        schemeHandler = handler
        config.setURLSchemeHandler(handler, forURLScheme: Self.scheme)

        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.suppressesIncrementalRendering = false
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.defaultWebpagePreferences.allowsContentJavaScript = true

        // Marca de plataforma nativa. El JavaScript la usa para elegir el
        // puente GameController y NO la Gamepad API: asi una misma pulsacion
        // nunca entra dos veces.
        let native = """
        (function () {
          window.__RASMATIC_NATIVE__ = { app: true, gamepad: true, version: '1.0' };
        })();
        """
        config.userContentController.addUserScript(
            WKUserScript(source: native, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )

        // Sin menu contextual ni seleccion de texto: el juego usa pulsaciones
        // largas y arrastres que iOS interpretaria como gestos del sistema.
        // (Se agrega a la configuracion ANTES de crear el WKWebView: el
        // WebView copia la configuracion al inicializarse.)
        let js = """
        (function () {
          var s = document.createElement('style');
          s.textContent = 'html,body,canvas{-webkit-touch-callout:none;' +
            '-webkit-user-select:none;user-select:none;}';
          document.documentElement.appendChild(s);
          document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
        })();
        """
        config.userContentController.addUserScript(
            WKUserScript(source: js, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
        )

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear

        // La escena se dibuja a pantalla completa: nada de rebote ni scroll.
        webView.scrollView.bounces = false
        webView.scrollView.alwaysBounceVertical = false
        webView.scrollView.alwaysBounceHorizontal = false
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = false

        // Safari Web Inspector para depurar desde un Mac (iOS 16.4+).
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }

        return webView
    }
}

// MARK: - Navegacion

extension GameViewController: WKNavigationDelegate {

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {

        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }

        if url.scheme == Self.scheme {
            decisionHandler(.allow)
            return
        }

        // Cualquier enlace externo (http, mailto, tel) se abre fuera de la app.
        if navigationAction.navigationType == .linkActivated {
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
        }
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // La pagina ya tiene RasmaticNativeGamepad: se anuncia el mando actual.
        gamepad?.webViewDidLoad()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        NSLog("[RASMATIC] navigation error: %@", error.localizedDescription)
    }

    func webView(_ webView: WKWebView,
                 didFailProvisionalNavigation navigation: WKNavigation!,
                 withError error: Error) {
        NSLog("[RASMATIC] provisional navigation error: %@", error.localizedDescription)
    }

    /// iOS puede descartar el proceso del WebView por memoria. El juego no
    /// guarda progreso fuera de la partida en curso, asi que recargar deja la
    /// app en el mismo estado inicial que al abrirla.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        NSLog("[RASMATIC] WebContent terminado: recargando")
        webView.load(URLRequest(url: Self.startURL))
    }
}

// MARK: - Servidor de archivos del bundle

/// Sirve `www/` bajo `rasmatic://app/...`.
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {

    private let root: URL
    private var stoppedTasks = Set<ObjectIdentifier>()

    /// Directorio `www` dentro del bundle. La fase de recursos copia el
    /// folder reference tal cual, asi que queda en la raiz del .app.
    static func bundleRoot() -> URL {
        if let url = Bundle.main.url(forResource: "www", withExtension: nil) {
            return url
        }
        // Respaldo: por si el folder reference se empaqueta con otro nombre.
        return Bundle.main.bundleURL.appendingPathComponent("www", isDirectory: true)
    }

    init(root: URL) {
        self.root = root.standardizedFileURL
    }

    // MARK: WKURLSchemeHandler

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            finish(urlSchemeTask, with: 400)
            return
        }

        var path = url.path
        if path.isEmpty || path == "/" { path = "/index.html" }
        let decoded = path.removingPercentEncoding ?? path
        let relative = String(decoded.dropFirst())   // sin la barra inicial
        let fileURL = root.appendingPathComponent(relative).standardizedFileURL

        // Solo se sirve lo que esta dentro de www/ (sin ../).
        guard fileURL.path.hasPrefix(root.path + "/") || fileURL.path == root.path else {
            finish(urlSchemeTask, with: 403)
            return
        }

        guard let data = try? Data(contentsOf: fileURL, options: [.mappedIfSafe]) else {
            finish(urlSchemeTask, with: 404)
            return
        }

        let headers: [String: String] = [
            "Content-Type": BundleSchemeHandler.mimeType(for: fileURL.pathExtension),
            "Content-Length": String(data.count),
            // El contenido va dentro del .app: si cambia, cambia la version.
            "Cache-Control": "no-cache",
            "Access-Control-Allow-Origin": "*"
        ]

        guard let response = HTTPURLResponse(url: url,
                                             statusCode: 200,
                                             httpVersion: "HTTP/1.1",
                                             headerFields: headers) else {
            finish(urlSchemeTask, with: 500)
            return
        }

        deliver(urlSchemeTask) {
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didReceive(data)
            urlSchemeTask.didFinish()
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        // WKWebView puede cancelar una carga a mitad de camino. Llamar a
        // didFinish despues de stop lanza una excepcion de WebKit.
        stoppedTasks.insert(ObjectIdentifier(urlSchemeTask))
    }

    // MARK: Utilidades

    private func deliver(_ task: WKURLSchemeTask, _ body: () -> Void) {
        let id = ObjectIdentifier(task)
        if stoppedTasks.contains(id) {
            stoppedTasks.remove(id)
            return
        }
        body()
    }

    private func finish(_ task: WKURLSchemeTask, with status: Int) {
        guard let url = task.request.url,
              let response = HTTPURLResponse(url: url,
                                             statusCode: status,
                                             httpVersion: "HTTP/1.1",
                                             headerFields: ["Content-Type": "text/plain; charset=utf-8"]) else {
            return
        }
        deliver(task) {
            task.didReceive(response)
            task.didReceive(Data())
            task.didFinish()
        }
    }

    private static func mimeType(for ext: String) -> String {
        switch ext.lowercased() {
        case "html", "htm": return "text/html; charset=utf-8"
        case "js", "mjs":   return "text/javascript; charset=utf-8"
        case "css":         return "text/css; charset=utf-8"
        case "json":        return "application/json; charset=utf-8"
        case "webmanifest": return "application/manifest+json; charset=utf-8"
        case "woff2":       return "font/woff2"
        case "woff":        return "font/woff"
        case "ttf":         return "font/ttf"
        case "otf":         return "font/otf"
        case "png":         return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "gif":         return "image/gif"
        case "svg":         return "image/svg+xml"
        case "ico":         return "image/x-icon"
        case "mp4":         return "video/mp4"
        case "webm":        return "video/webm"
        case "txt":         return "text/plain; charset=utf-8"
        default:            return "application/octet-stream"
        }
    }
}
