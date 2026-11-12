//
//  AppDelegate.swift
//  RASMATIC · Lugar 3D
//
//  Punto de entrada minimo. Toda la aplicacion vive en GameViewController,
//  que muestra el mismo juego HTML/WebGL que la version Android.
//

import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {

        // El juego no usa red ni audio: no hace falta configurar nada mas.
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = GameViewController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
}
