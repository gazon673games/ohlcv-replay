const WorkbenchUX = (() => {
  const messages = {
    autoDataHint: ["График загружается автоматически. Сохранённые данные используются сразу, недостающий период догружается.", "The chart loads automatically. Saved data is reused and missing history is downloaded."],
    dataDetails: ["Сохранённые данные и качество", "Saved data and quality"],
    refreshChart: ["Обновить график", "Refresh chart"],
    cacheAutomatic: ["Автоматически: кэш и догрузка", "Automatic: cache and missing history"],
    cacheRefresh: ["Обновить сохранённые данные", "Refresh saved data"],
    cacheOffline: ["Только сохранённые данные", "Saved data only"],
    cacheNetwork: ["Загрузить заново", "Download again"],
    dataPanel: ["Данные", "Data"], appPreferences: ["Настройки приложения", "App preferences"],
    loadChart: ["Загрузить график", "Load chart"], chooseData: ["Выбрать инструмент и период", "Choose symbol and period"],
    expandEditor: ["Расширить редактор", "Expand editor"], collapseEditor: ["Обычная ширина", "Dock editor"],
    returnChart: ["К графику", "Back to chart"], openHistory: ["Открыть историю", "Open history"],
    checkingStrategy: ["Проверяем код и параметры…", "Checking code and parameters…"],
    strategyChecked: ["Код и параметры проверены", "Code and parameters checked"],
    strategyCheckFailed: ["Не удалось проверить стратегию", "Strategy check failed"],
    strategyChanged: ["Черновик изменился. Проверьте стратегию ещё раз.", "Draft changed. Validate the strategy again."],
    requireCheckedData: ["Только проверенные данные", "Require approved data"],
    nextRunData: ["Данные следующего прогона", "Next run data"],
    chartQualitySeparate: ["Набор для отображения графика проверяется отдельно.", "Chart display data is reviewed separately."],
    dataApproved: ["Проверено", "Approved"], dataUnknown: ["Не проверено", "Not reviewed"],
    dataRejected: ["Данные не допущены", "Data blocked"], dataSplit: ["Данные требуют разделения", "Data must be split"],
    jobWarning: ["Нужно действие", "Action needed"],
    preparingRun: ["Подготавливаем данные стратегии…", "Preparing strategy data…"],
    startingApp: ["Открываем рабочее пространство…", "Opening workspace…"], ready: ["Готово", "Ready"],
    jobIdle: ["Готово", "Ready"], jobQueued: ["В очереди", "Queued"], jobRunning: ["Выполняется", "Running"],
    jobCompleted: ["Готово", "Done"], jobFailed: ["Ошибка", "Failed"], jobCancelled: ["Отменено", "Cancelled"],
    phaseData: ["Загружаем историю", "Loading history"], phaseReuse: ["Читаем сохранённую историю", "Reading saved history"],
    phaseQuality: ["Проверяем качество данных", "Checking data quality"], phaseBuild: ["Подготавливаем график", "Preparing chart"],
    phaseStrategy: ["Проверяем стратегию", "Checking strategy"], phaseRun: ["Выполняем бектест", "Running backtest"],
    phaseReport: ["Формируем отчёт", "Building report"], phaseResearch: ["Выполняем исследование", "Running research"],
    phaseWorker: ["Запускаем задачу", "Starting job"], markerUnavailable: ["Исполнение не связано с закрытой сделкой этого отчёта.", "This execution is not linked to a closed trade in this report."],
    markerAmbiguous: ["Это исполнение связано с несколькими сделками. Выберите строку в таблице.", "This execution matches several trades. Select a row in the table."],
    strategyPanel: ["Стратегия", "Strategy"], closePanel: ["Закрыть панель", "Close panel"],
    focusChart: ["Фокус на графике", "Focus chart"], restoreLayout: ["Вернуть панели", "Restore panels"],
    overview: ["Обзор", "Overview"], trades: ["Сделки", "Trades"], decisions: ["Решения", "Decisions"],
    hideResults: ["Свернуть результаты", "Collapse results"],
    runContext: ["Результат прогона", "Run result"], noReport: ["Запустите стратегию или откройте сохранённый прогон.", "Run a strategy or open a saved run."],
    tradeSearch: ["Найти сделку: номер, дата, направление", "Find trade: number, date, direction"],
    tradeDirection: ["Направление", "Direction"], allTrades: ["Все", "All"],
    long: ["Лонг", "Long"], short: ["Шорт", "Short"],
    newestFirst: ["Сначала новые", "Newest first"], oldestFirst: ["Сначала старые", "Oldest first"],
    showOnChart: ["Показать на графике", "Show on chart"],
    tradeUnavailable: ["Свечи этой сделки отсутствуют в текущем графике.", "This trade's candles are unavailable in the current chart."],
    chartReloadNeeded: ["Для выбранного таймфрейма загрузите график. Текущий результат сохранён.", "Load chart for the selected timeframe. The current result is preserved."],
    tradeSelected: ["На графике сделка", "Trade on chart"],
    compareSelection: ["Выберите прогоны для сравнения", "Select runs to compare"],
    compareNeedsTwo: ["Выберите минимум два завершённых прогона.", "Select at least two completed runs."],
    compareSelected: ["Выбрано для сравнения", "Selected for comparison"],
    runBusy: ["Выполняется задача. Дождитесь завершения или отмените её.", "A job is active. Wait for it to finish or cancel it."],
    cancelled: ["Задача отменена", "Job cancelled"], cancelRequested: ["Запрошена отмена…", "Cancellation requested…"],
    zoomIn: ["Приблизить", "Zoom in"], zoomOut: ["Отдалить", "Zoom out"],
    autoScale: ["Автошкала цены", "Auto price scale"], resetChart: ["Весь период", "Full period"],
    crosshair: ["Перекрестие", "Crosshair"], chartHelp: ["Управление графиком", "Chart controls"],
    shortcutHelp: ["Горячие клавиши", "Keyboard shortcuts"],
    shortcutText: ["Ctrl+Enter — запуск · Ctrl+Shift+E — расширить редактор · Alt+1 — данные · Alt+2 — стратегия · Alt+3 — сделки · Alt+Enter — фокус · Esc — вернуть панели. Ctrl+колёсико — масштаб всех окон; средняя кнопка мыши — перемещение рабочей области; кнопка процента внизу — 100%. На графике: +/− — масштаб, ←/→ — перемещение, Home — весь период. Колесо — масштаб, перетаскивание — перемещение; шкалы цены и времени можно растягивать.", "Ctrl+Enter — run · Ctrl+Shift+E — expand editor · Alt+1 — data · Alt+2 — strategy · Alt+3 — trades · Alt+Enter — focus · Esc — restore panels. Ctrl+wheel zooms all windows; drag with the middle mouse button to pan the workspace; click the percentage below to reset to 100%. On chart: +/− — zoom, ←/→ — pan, Home — full period. Wheel zooms, drag pans; drag price/time scales to resize."],
    sidebarSize: ["Ширина боковой панели", "Sidebar width"], resultSize: ["Высота результатов", "Results height"],
    sourcePeriod: ["Период и данные", "Period and data"],
    reportParams: ["Параметры прогона", "Run parameters"],
    draftHint: ["Настройки справа относятся к следующему запуску. Параметры выбранного результата показаны в обзоре.", "Settings on the right apply to the next run. The selected result's parameters are shown in Overview."],
    tradeCount: ["Показано сделок", "Trades shown"],
  };
  function t(key) {
    return messages[key]?.[document.documentElement.lang === "en" ? 1 : 0] || key;
  }
  function apply() {
    document.querySelectorAll("[data-ux]").forEach(node => { node.textContent = t(node.dataset.ux); });
    document.querySelectorAll("[data-ux-title]").forEach(node => {
      node.title = t(node.dataset.uxTitle);
      node.setAttribute("aria-label", node.title);
    });
    document.querySelectorAll("[data-ux-placeholder]").forEach(node => {
      node.placeholder = t(node.dataset.uxPlaceholder);
      node.setAttribute("aria-label", node.placeholder);
    });
  }
  return { apply, t };
})();
