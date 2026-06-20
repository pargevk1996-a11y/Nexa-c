import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    // Secure text field used for the iOS screenshot-prevention trick.
    // iOS prevents capturing the contents of any window that is associated
    // with a UITextField that has isSecureTextEntry = true.
    private var secureTextField: UITextField?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        applyScreenshotProtection()
        return true
    }

    // ── iOS Screenshot / Screen-Recording Prevention ──────────────────────
    // iOS has no direct FLAG_SECURE equivalent, but we can exploit the fact
    // that UITextField with isSecureTextEntry=true makes its parent layer
    // non-capturable by the screenshot and screen-recording subsystem.
    private func applyScreenshotProtection() {
        guard let window = UIApplication.shared.windows.first else { return }

        // 1. Create a secure text field and embed it so its layer wraps the
        //    whole window — this makes the entire window appear black in
        //    screenshots and screen recordings captured by iOS.
        let field = UITextField()
        field.isSecureTextEntry = true
        field.isUserInteractionEnabled = false

        // The secure layer is attached to the field's layer parent; we add
        // it to the window's own subview hierarchy at z-index below content.
        window.addSubview(field)
        field.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            field.centerXAnchor.constraint(equalTo: window.centerXAnchor),
            field.centerYAnchor.constraint(equalTo: window.centerYAnchor),
            field.widthAnchor.constraint(equalToConstant: 1),
            field.heightAnchor.constraint(equalToConstant: 1),
        ])
        field.alpha = 0       // invisible to the user
        window.layer.superlayer?.addSublayer(field.layer)
        field.layer.sublayers?.first?.addSublayer(window.layer)

        secureTextField = field

        // 2. Observe screenshot and screen-capture events to log / alert.
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(userDidTakeScreenshot),
            name: UIApplication.userDidTakeScreenshotNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(screenCaptureDidChange),
            name: UIScreen.capturedDidChangeNotification,
            object: nil
        )
    }

    @objc private func userDidTakeScreenshot() {
        // Screenshot was attempted — content already appeared black.
        // Optionally show a toast or log a security event here.
    }

    @objc private func screenCaptureDidChange() {
        // Screen recording started or stopped.
        // UIScreen.main.isCaptured == true while recording is active.
    }

    // ── Standard Capacitor delegates ──────────────────────────────────────

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}
    func applicationDidBecomeActive(_ application: UIApplication) {}
    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }
}
