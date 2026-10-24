//
//  AppexSaverMinimalView.swift
//  AppexSaverMinimalExtension
//
//  Copyright © 2026 Guillaume Louel. Licensed under the MIT License.
//  Agent Office changes: the rainbow animation is replaced by a full-bleed
//  WKWebView showing the Agent Office scene served by the local server.
//
//  The page draws itself once ticked (see the manual frame pump below), so
//  SSENeedsAnimationTimer stays false in Info.plist. The web view is created
//  when the view joins a window and torn down when it leaves it: the host
//  releases views without calling stopAnimation(), and a web view left loaded
//  would keep rendering in the background.
//
//  URL: `http://localhost:4317/` by default; override with
//  `defaults write dev.agent-office.saver.Extension url http://host:port/`
//  (from the extension's sandbox container domain, see README).
//

import ScreenSaver
import WebKit

private let logger = AppexLog.logger("View")

final class AppexSaverMinimalView: ScreenSaverView, WKNavigationDelegate {

    static let defaultURL = "http://localhost:4317/"
    /// Night background of the scene, shown until the page paints (no white flash).
    private static let night = NSColor(srgbRed: 0x11 / 255, green: 0x0d / 255, blue: 0x1a / 255, alpha: 1)

    private var webView: WKWebView?
    private var retry: DispatchWorkItem?
    private var frameLink: CADisplayLink?
    private var diagTimer: Timer?
    private var activityToken: NSObjectProtocol?

    override init?(frame: NSRect, isPreview: Bool) {
        logger.info("init(frame: \(NSStringFromRect(frame), privacy: .public), isPreview: \(isPreview))")
        super.init(frame: frame, isPreview: isPreview)
        wantsLayer = true
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        wantsLayer = true
    }

    deinit {
        logger.info("deinit")
    }

    override func makeBackingLayer() -> CALayer {
        let layer = CALayer()
        layer.backgroundColor = Self.night.cgColor
        layer.isOpaque = true
        return layer
    }

    // MARK: - URL

    private var url: URL {
        let module = Bundle(for: AppexSaverMinimalView.self).bundleIdentifier ?? "dev.agent-office.saver.Extension"
        let stored = ScreenSaverDefaults(forModuleWithName: module)?.string(forKey: "url")
        return URL(string: stored ?? Self.defaultURL) ?? URL(string: Self.defaultURL)!
    }

    // MARK: - Web view life cycle

    /// The host view is never the key/active window, so WebKit's internal page-visibility
    /// state is permanently "hidden": `document.hidden` reports true and both
    /// `requestAnimationFrame` and `setInterval` are throttled (rAF to a near-stop,
    /// `setInterval` to a choppy cadence), regardless of what's actually on screen.
    /// `document.hidden` can be spoofed from JS (done below), but that throttling lives below
    /// JS and can't be — so the page's render loop (`src/engine/loop.ts`) checks
    /// `__forceManualFrames` and, when set, exposes a manual tick instead of scheduling its
    /// own timer. The native `Timer` below drives that tick directly: `evaluateJavaScript`
    /// runs regardless of the page's own throttled timers, since it isn't scheduled through
    /// them.
    private static let forceVisibleScript: WKUserScript = {
        let source = """
        window.__forceManualFrames = true;
        Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
        Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
        """
        return WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true)
    }()

    private static let tickScript = "window.__agentOfficeManualTick && window.__agentOfficeManualTick(performance.now());"

    private func startWebView() {
        guard webView == nil else { return }
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.mediaTypesRequiringUserActionForPlayback = []
        config.userContentController.addUserScript(Self.forceVisibleScript)
        config.preferences.setValue(false, forKey: "pageVisibilityBasedProcessSuppressionEnabled")
        let web = WKWebView(frame: bounds, configuration: config)
        web.autoresizingMask = [.width, .height]
        web.setValue(false, forKey: "drawsBackground")
        web.setValue(false, forKey: "windowOcclusionDetectionEnabled")
        web.navigationDelegate = self
        addSubview(web)
        webView = web
        load()

        // Diagnostics (logged via `diag` below) show the page computing a flawless, uninterrupted
        // 30fps the whole time even while the screen visibly goes blank/flickers — so frames are
        // being drawn correctly but not consistently reaching the display. Between our periodic
        // evaluateJavaScript calls, RunningBoard treats this process as backgroundable (nothing else
        // marks it as doing active, user-visible work), which appears to suppress GPU process frame
        // presentation. Holding a sustained "user interactive" activity keeps it out of that state.
        activityToken = ProcessInfo.processInfo.beginActivity(
            options: [.userInitiated, .userInteractive, .idleSystemSleepDisabled, .suddenTerminationDisabled],
            reason: "Agent Office screensaver rendering"
        )

        // A plain Timer is wall-clock-scheduled, not tied to the screen's actual vsync, so
        // frames it triggers can land out of step with the display's own refresh — visible as
        // flicker/tearing on this content. CADisplayLink ticks in lockstep with the real
        // screen refresh instead.
        let link = displayLink(target: self, selector: #selector(onDisplayLink))
        link.add(to: .main, forMode: .common)
        frameLink = link

        let diag = Timer(timeInterval: 2.0, repeats: true) { [weak self] _ in
            self?.webView?.evaluateJavaScript(
                "JSON.stringify({hidden: document.hidden, fps: window.__agentOffice ? window.__agentOffice.stats.fps : 'none', frames: window.__agentOffice ? window.__agentOffice.stats.frames : 'none', agents: window.__agentOffice ? window.__agentOffice.office.agents.size : 'none'})"
            ) { result, error in
                if let error { logger.error("diag eval failed: \(error.localizedDescription, privacy: .public)") }
                if let s = result as? String { logger.notice("diag: \(s, privacy: .public)") }
            }
        }
        RunLoop.main.add(diag, forMode: .common)
        diagTimer = diag
    }

    @objc private func onDisplayLink(_ link: CADisplayLink) {
        webView?.evaluateJavaScript(Self.tickScript, completionHandler: nil)
    }

    private func stopWebView() {
        retry?.cancel()
        retry = nil
        frameLink?.invalidate()
        frameLink = nil
        diagTimer?.invalidate()
        diagTimer = nil
        if let activityToken {
            ProcessInfo.processInfo.endActivity(activityToken)
            self.activityToken = nil
        }
        guard let web = webView else { return }
        web.stopLoading()
        web.navigationDelegate = nil
        web.loadHTMLString("", baseURL: nil)
        web.removeFromSuperview()
        webView = nil
        logger.info("web view released")
    }

    private func load() {
        let target = url
        logger.info("loading \(target.absoluteString, privacy: .public)")
        webView?.load(URLRequest(url: target, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 5))
    }

    /// The server may not be up yet (login, restart): retry quietly every 5 s.
    private func scheduleRetry() {
        retry?.cancel()
        let item = DispatchWorkItem { [weak self] in self?.load() }
        retry = item
        DispatchQueue.main.asyncAfter(deadline: .now() + 5, execute: item)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        logger.info("page loaded")
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        logger.error("navigation failed: \(error.localizedDescription, privacy: .public)")
        scheduleRetry()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        logger.error("provisional navigation failed: \(error.localizedDescription, privacy: .public)")
        scheduleRetry()
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        logger.error("web content process terminated, reloading")
        scheduleRetry()
    }

    // MARK: - ScreenSaverView

    override func startAnimation() {
        logger.info("startAnimation()")
        super.startAnimation()
        if window != nil { startWebView() }
    }

    override func stopAnimation() {
        logger.info("stopAnimation()")
        stopWebView()
        super.stopAnimation()
    }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        logger.info("viewDidMoveToWindow() hasWindow=\(self.window != nil)")
        if window != nil { startWebView() } else { stopWebView() }
    }
}
