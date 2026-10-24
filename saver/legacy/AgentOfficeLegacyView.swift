import ScreenSaver
import WebKit
import os

private let log = Logger(subsystem: "dev.agent-office.legacy", category: "view")

@objc(AgentOfficeLegacyView)
final class AgentOfficeLegacyView: ScreenSaverView, WKNavigationDelegate {
    private static let url = URL(string: "http://localhost:4317/")!
    private var webView: WKWebView?
    private var retry: DispatchWorkItem?
    private var frameLink: CADisplayLink?
    private static let forceScript = WKUserScript(source: """
        window.__forceManualFrames = true;
        Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
        Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
        """, injectionTime: .atDocumentStart, forMainFrameOnly: true)

    override init?(frame: NSRect, isPreview: Bool) {
        super.init(frame: frame, isPreview: isPreview)
        wantsLayer = true
        layer?.backgroundColor = NSColor(srgbRed: 0x11 / 255, green: 0x0d / 255, blue: 0x1a / 255, alpha: 1).cgColor
    }

    required init?(coder: NSCoder) { super.init(coder: coder) }

    private func start() {
        guard webView == nil else { return }
        log.notice("start frame=\(NSStringFromRect(self.bounds), privacy: .public)")
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.userContentController.addUserScript(Self.forceScript)
        config.preferences.setValue(false, forKey: "pageVisibilityBasedProcessSuppressionEnabled")
        let web = WKWebView(frame: bounds, configuration: config)
        web.autoresizingMask = [.width, .height]
        web.setValue(false, forKey: "drawsBackground")
        web.setValue(false, forKey: "windowOcclusionDetectionEnabled")
        web.navigationDelegate = self
        addSubview(web)
        webView = web
        load()
        let link = displayLink(target: self, selector: #selector(tick))
        link.add(to: .main, forMode: .common)
        frameLink = link
    }

    @objc private func tick(_ link: CADisplayLink) {
        webView?.evaluateJavaScript("window.__agentOfficeManualTick && window.__agentOfficeManualTick(performance.now());", completionHandler: nil)
    }

    private func stop() {
        frameLink?.invalidate()
        frameLink = nil
        log.notice("stop")
        retry?.cancel()
        webView?.stopLoading()
        webView?.removeFromSuperview()
        webView = nil
    }

    private func load() {
        webView?.load(URLRequest(url: Self.url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 5))
    }

    private func scheduleRetry() {
        retry?.cancel()
        let item = DispatchWorkItem { [weak self] in self?.load() }
        retry = item
        DispatchQueue.main.asyncAfter(deadline: .now() + 5, execute: item)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { log.error("fail: \(error.localizedDescription, privacy: .public)"); scheduleRetry() }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { log.error("provisional fail: \(error.localizedDescription, privacy: .public)"); scheduleRetry() }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        log.notice("loaded")
        let js = "JSON.stringify({hidden: document.hidden, fps: window.__agentOffice ? window.__agentOffice.stats.fps : 'none', agents: window.__agentOffice ? window.__agentOffice.office.agents.size : 'none', w: innerWidth, h: innerHeight})"
        Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] t in
            guard let self, self.webView != nil else { t.invalidate(); return }
            self.webView?.evaluateJavaScript(js) { r, e in log.notice("diag \((r as? String) ?? e?.localizedDescription ?? "?", privacy: .public)") }
        }
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { log.error("content process terminated"); scheduleRetry() }

    override func startAnimation() { super.startAnimation(); start() }
    override func stopAnimation() { stop(); super.stopAnimation() }
    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        if window != nil { start() } else { stop() }
    }
}
