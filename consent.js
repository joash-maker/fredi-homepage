/* Mediahubink cookie consent.
   Google Analytics is NOT loaded until the visitor clicks "Accept".
   Before that, gtag() calls are only queued in the page and never sent.
   Set window.MHI_GA_ID before this script. Reopen the banner with mhiCookieSettings(). */
(function () {
  var KEY = 'mhi_cookie_consent';
  var ID = window.MHI_GA_ID;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };

  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  function loadGA() {
    if (window.__mhiGaLoaded || !ID) return;
    window.__mhiGaLoaded = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
    document.head.appendChild(s);
    window.gtag('js', new Date());
    window.gtag('config', ID);
  }

  function clearGA() {
    var host = location.hostname, parts = host.split('.'), domains = [host, '.' + host];
    if (parts.length > 2) domains.push('.' + parts.slice(-2).join('.'));
    document.cookie.split(';').forEach(function (c) {
      var name = c.split('=')[0].trim();
      if (name === '_ga' || name.indexOf('_ga_') === 0 || name === '_gid') {
        domains.forEach(function (d) {
          document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=' + d;
        });
        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
      }
    });
    if (ID) window['ga-disable-' + ID] = true;
  }

  function close(el) { if (el && el.parentNode) el.parentNode.removeChild(el); }

  function banner() {
    if (document.getElementById('mhi-cookie')) return;
    var el = document.createElement('div');
    el.id = 'mhi-cookie';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-label', 'Cookie choice');
    el.innerHTML =
      '<p>We\'d like to use Google Analytics cookies to see how people use this site, so we can improve it. ' +
      'No advertising, and nothing is sold. <a href="https://www.mediahubink.com/privacy#cookies">Privacy policy</a></p>' +
      '<div class="mhi-cookie-btns"><button type="button" data-c="denied">Reject</button>' +
      '<button type="button" data-c="granted" class="mhi-accept">Accept</button></div>';
    var css = document.createElement('style');
    css.textContent =
      '#mhi-cookie{position:fixed;left:20px;bottom:20px;z-index:10000;max-width:420px;background:#17181A;color:#F7F5F1;' +
      'border:1px solid rgba(198,164,108,0.35);border-radius:12px;padding:16px 18px;box-shadow:0 20px 50px rgba(0,0,0,0.5);' +
      'font:300 13px/1.6 Inter,system-ui,sans-serif}' +
      '#mhi-cookie p{margin:0 0 12px;color:#D9D2C5}#mhi-cookie a{color:#E8C583}' +
      '.mhi-cookie-btns{display:flex;gap:8px;justify-content:flex-end}' +
      '#mhi-cookie button{font:500 13px Inter,system-ui,sans-serif;padding:8px 16px;border-radius:3px;cursor:pointer;' +
      'border:1px solid rgba(198,164,108,0.4);background:transparent;color:#F7F5F1}' +
      '#mhi-cookie button.mhi-accept{background:#C6A46C;border-color:#C6A46C;color:#101112}' +
      '#mhi-cookie button:focus-visible{outline:2px solid #E8C583;outline-offset:2px}' +
      '@media(max-width:560px){#mhi-cookie{left:10px;right:10px;bottom:10px;max-width:none}#mhi-cookie button{flex:1}}';
    el.appendChild(css);
    el.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-c]') : null;
      if (!b) return;
      var choice = b.getAttribute('data-c');
      set(choice);
      if (choice === 'granted') loadGA(); else clearGA();
      close(el);
    });
    document.body.appendChild(el);
  }

  window.mhiCookieSettings = function () { banner(); return false; };

  var choice = get();
  if (choice === 'granted') {
    loadGA();
  } else {
    if (choice === 'denied') clearGA();
    else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', banner);
    else banner();
  }
})();
