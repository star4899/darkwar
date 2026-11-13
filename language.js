'use strict';

const siteLanguage = (() => {
  const key = 'random-bgb-language';
  const selector = document.getElementById('site-language');
  const attributes = ['text', 'aria-label', 'placeholder', 'content'];
  let language = 'en';

  function translate(element, attribute, value) {
    if (attribute === 'text') element.textContent = value;
    else element.setAttribute(attribute, value);
  }

  function setText(element, en, ko, attribute = 'text') {
    element.setAttribute(`data-en-${attribute}`, en);
    element.setAttribute(`data-ko-${attribute}`, ko);
    translate(element, attribute, language === 'ko' ? ko : en);
  }

  function apply(value) {
    language = value === 'ko' ? 'ko' : 'en';
    selector.value = language;
    document.documentElement.lang = language;

    for (const attribute of attributes) {
      for (const element of document.querySelectorAll(`[data-ko-${attribute}]`)) {
        const en = element.getAttribute(`data-en-${attribute}`)
          ?? (attribute === 'text' ? element.textContent : element.getAttribute(attribute));
        setText(element, en, element.getAttribute(`data-ko-${attribute}`), attribute);
      }
    }
    document.dispatchEvent(new Event('site-language-change'));
  }

  function restore() {
    let saved;
    try { saved = localStorage.getItem(key); } catch { saved = language; }
    apply(saved);
  }

  selector.addEventListener('change', () => {
    apply(selector.value);
    try { localStorage.setItem(key, language); } catch { /* Keep the choice in this page. */ }
  });
  window.addEventListener('pageshow', restore);
  restore();

  return { get value() { return language; }, setText };
})();
