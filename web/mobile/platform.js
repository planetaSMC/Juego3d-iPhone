/* ============================================================
   RASMATIC · Detección de plataforma y dispositivo (V21.2)
   ------------------------------------------------------------
   Agrega clases al <html> para que el CSS pueda mostrar solo los
   controles/indicadores que corresponden al dispositivo real:

     ras-platform-ios | android | windows | mac | other
     ras-mobile | ras-desktop
     ras-native  (app iOS con puente nativo)
     ras-remote-linked (Head Tracking emparejado con el calibrador PC)

   No toca la partida ni el render. Solo informa y mantiene el
   estado visual compartido entre iOS, Windows y la PWA.
   ============================================================ */
(function () {
  'use strict';

  var root = document.documentElement;
  var ua = navigator.userAgent || '';
  var platform = navigator.platform || '';
  var touchPoints = navigator.maxTouchPoints || 0;

  /* iPad moderno se identifica como MacIntel con pantalla táctil. */
  var iOS = /iPad|iPhone|iPod/.test(ua) ||
    (platform === 'MacIntel' && touchPoints > 1);
  var android = /Android/i.test(ua);
  var windows = /Windows/i.test(ua);
  var mac = !iOS && /Macintosh|Mac OS X/i.test(ua);
  var mobile = iOS || android ||
    (/Mobi|Tablet/i.test(ua) && touchPoints > 0);

  var id = iOS ? 'ios' : (android ? 'android' : (windows ? 'windows' : (mac ? 'mac' : 'other')));

  root.classList.add('ras-platform-' + id);
  root.classList.add(mobile ? 'ras-mobile' : 'ras-desktop');
  if (window.__RASMATIC_NATIVE__) root.classList.add('ras-native');

  var remote = false;

  function label() {
    if (iOS) return /iPad/i.test(ua) ? 'iPad' : 'iPhone';
    if (android) return 'Android';
    if (windows) return 'Windows';
    if (mac) return 'Mac';
    return 'Dispositivo';
  }

  window.RasmaticPlatform = {
    id: id,
    label: label(),
    isIOS: iOS,
    isAndroid: android,
    isWindows: windows,
    isMac: mac,
    isMobile: mobile,
    isDesktop: !mobile,
    hasTouch: touchPoints > 0,
    isNative: !!window.__RASMATIC_NATIVE__,
    isRemote: function () { return remote; },
    /* El puente iOS llama a esto cuando el enlace con Windows cambia.
       Con la PC conectada, iOS oculta los indicadores locales de HT
       que Windows ya está controlando. */
    setRemote: function (on) {
      remote = !!on;
      root.classList.toggle('ras-remote-linked', remote);
      document.body.classList.toggle('ras-remote-linked', remote);
      try {
        document.dispatchEvent(new CustomEvent('rasmatic:remote', {
          detail: { linked: remote }
        }));
      } catch (e) { /* navegadores sin CustomEvent */ }
      return remote;
    }
  };
})();
