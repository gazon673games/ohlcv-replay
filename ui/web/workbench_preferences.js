const WorkbenchPreferences = (() => {
  const LOCALE_KEY = "ohlcv-replay.locale";
  const THEME_KEY = "ohlcv-replay.theme";
  const COOKIE_KEY = "ohlcv_replay_preferences_v1";
  const COOKIE_MAX_AGE = 10 * 365 * 24 * 60 * 60;

  function init() {
    const remembered = read();
    const locale = validLocale(remembered.locale || localStorage.getItem(LOCALE_KEY));
    const theme = validTheme(remembered.theme || localStorage.getItem(THEME_KEY));
    document.getElementById("localeSelect").value = locale;
    document.getElementById("themeSelect").value = theme;
    write({ locale, theme });
    apply(locale, theme, false);
    document.getElementById("localeSelect").addEventListener("change", update);
    document.getElementById("themeSelect").addEventListener("change", update);
  }

  function update() {
    const locale = document.getElementById("localeSelect").value;
    const theme = document.getElementById("themeSelect").value;
    localStorage.setItem(LOCALE_KEY, locale);
    localStorage.setItem(THEME_KEY, theme);
    write({ locale, theme });
    apply(locale, theme, true);
  }

  function section(name) {
    const value = read()[name];
    return value && typeof value === "object" ? value : {};
  }

  function updateSection(name, value) {
    write({ [name]: value });
  }

  function read() {
    const prefix = `${COOKIE_KEY}=`;
    const raw = document.cookie.split(";").map((item) => item.trim())
      .find((item) => item.startsWith(prefix))?.slice(prefix.length);
    if (!raw) return {};
    try {
      const value = JSON.parse(decodeURIComponent(raw));
      return value && typeof value === "object" ? value : {};
    } catch (_error) {
      return {};
    }
  }

  function write(patch) {
    const value = encodeURIComponent(JSON.stringify({ ...read(), ...patch }));
    document.cookie = `${COOKIE_KEY}=${value}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Strict`;
  }

  function validLocale(value) {
    return value === "en" ? "en" : "ru";
  }

  function validTheme(value) {
    return ["light", "dark", "grimdark"].includes(value) ? value : "light";
  }

  function apply(locale, theme, notify) {
    document.documentElement.dataset.theme = validTheme(theme);
    WorkbenchI18n.apply(locale);
    if (notify) {
      window.dispatchEvent(new CustomEvent("workbench-preferences-change", {
        detail: { locale, theme },
      }));
    }
  }

  function theme() {
    return document.documentElement.dataset.theme || "light";
  }

  return { init, section, theme, updateSection };
})();
