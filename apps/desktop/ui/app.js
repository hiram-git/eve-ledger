// IskPulse desktop wizard and settings. Talks to Rust (src-tauri/src/lib.rs) with invoke().
// Without Tauri (opening the page in a browser with ?preview) it uses sample data, to review the design.

const T = {
  es: {
    setupTitle: 'Configura tu IskPulse',
    settingsTitle: 'Configuración',
    settingsLead: 'Los cambios se guardan en tu archivo de configuración y reinician el ledger.',
    setupLead: "IskPulse corre solo en tu equipo: guarda los tokens de EVE cifrados con una clave que se genera aquí y no envía nada a nadie salvo las llamadas a ESI.",
    prefsTitle: 'Preferencias',
    pilotSlots: 'Pilotos que vas a vincular',
    pilotSlotsHint: 'Plazas en la página de pilotos. Puedes vincular más.',
    syncInterval: 'Sincronizar cada (minutos)',
    syncIntervalHint: '0 = solo a mano. ESI se actualiza cada hora: menos de 60 no trae datos más frescos.',
    omegaAccounts: 'Cuentas en Omega',
    omegaAccountsHint: 'Para el indicador «Omega de todas las cuentas».',
    omegaPlex: 'PLEX por mes de Omega',
    omegaPlexHint: 'Lo que cuesta un mes de Omega de cada cuenta.',
    esiContact: 'Contacto para ESI (opcional)',
    esiContactHint: 'Tu nombre en EVE o un email. CCP lo pide para poder avisar si algo falla.',
    backgroundTitle: 'En segundo plano',
    backgroundLead: 'ESI solo guarda unos 30 días de wallet: los días que IskPulse no está abierto no se pueden recuperar después.',
    startAtLogin: 'Abrir IskPulse al iniciar sesión',
    startAtLoginHint: 'Arranca en la bandeja del sistema, sin ventana, y sincroniza aunque no lo abras.',
    closeToTray: 'Al cerrar la ventana, seguir en la bandeja',
    closeToTrayHint: 'Sigue sincronizando. Para salir del todo, «Salir» en su icono de la bandeja o en el menú.',
    advancedTitle: 'Avanzado',
    webPort: 'Puerto del dashboard',
    encTitle: 'Clave de cifrado:',
    encText: 'se generó al instalar y cifra los tokens de tus pilotos. Si la regeneras, tendrás que volver a vincularlos.',
    encRegenerate: 'Regenerar la clave',
    encConfirm: '¿Regenerar la clave de cifrado? Tendrás que volver a vincular todos tus pilotos.',
    encChanged: 'Clave nueva: al guardar, vuelve a vincular tus pilotos en la página Pilotos.',
    configFile: 'Configuración',
    dataDir: 'Datos (tu historial)',
    logDir: 'Registros',
    open: 'Abrir',
    saveFirst: 'Guardar y abrir el ledger',
    save: 'Guardar y reiniciar',
    saving: 'Guardando…',
    cancel: 'Cancelar',
    errorsTitle: 'Revisa estos campos:',
    err_clientId: 'Esta compilación no trae la aplicación de EVE: compílala con EVE_LEDGER_CLIENT_ID (ver apps/desktop/README.md).',
    webPortHint: 'Donde se abre el dashboard, solo en este equipo.',
    err_bundledPort: "La aplicación de EVE incluida solo funciona con el puerto 47300 de la API (API_PORT en el archivo de configuración).",
    err_encKey: 'La clave de cifrado no es válida: regenérala en «Avanzado».',
    err_ports: 'Los puertos tienen que ser distintos y mayores que 1023.',
    err_numbers: 'Los pilotos y los PLEX por mes tienen que ser al menos 1.',
    startingTitle: 'Arrancando IskPulse…',
    startingText: 'Preparando la base de datos y el dashboard. Tarda unos segundos.',
    errorTitle: 'IskPulse no pudo arrancar',
    err_port: (p) => `El puerto ${p} lo está usando otro programa (¿otra copia de IskPulse?). Ciérralo o cambia el puerto en Configuración → Avanzado.`,
    err_exited: (name) => `${name === 'api' ? 'La API' : 'El dashboard'} se cerró al arrancar. Esto dice su registro:`,
    err_timeout: 'Los servicios no respondieron a tiempo. Reintenta o mira los registros.',
    err_other: 'Error inesperado:',
    retry: 'Reintentar',
    openSettings: 'Configuración',
    openLogs: 'Abrir los registros',
  },
  en: {
    setupTitle: 'Set up your IskPulse',
    settingsTitle: 'Settings',
    settingsLead: 'Changes are saved to your settings file and restart the ledger.',
    setupLead: "IskPulse runs only on your computer: it stores your EVE tokens encrypted with a key generated here and sends nothing to anyone except the ESI calls.",
    prefsTitle: 'Preferences',
    pilotSlots: 'Pilots you will link',
    pilotSlotsHint: 'Slots on the pilots page. You can link more.',
    syncInterval: 'Sync every (minutes)',
    syncIntervalHint: '0 = manual only. ESI updates hourly: under 60 brings no fresher data.',
    omegaAccounts: 'Omega accounts',
    omegaAccountsHint: 'For the “Omega for all accounts” indicator.',
    omegaPlex: 'PLEX per Omega month',
    omegaPlexHint: 'What one month of Omega costs per account.',
    esiContact: 'Contact for ESI (optional)',
    esiContactHint: 'Your EVE name or an email. CCP asks for it to reach you if something breaks.',
    backgroundTitle: 'In the background',
    backgroundLead: 'ESI only keeps about 30 days of wallet history: days when IskPulse isn’t running can’t be recovered later.',
    startAtLogin: 'Open IskPulse when I sign in',
    startAtLoginHint: 'Starts in the system tray, without a window, and syncs even if you don’t open it.',
    closeToTray: 'Keep running in the tray when I close the window',
    closeToTrayHint: 'It keeps syncing. To quit completely, use Quit in its tray icon or in the menu.',
    advancedTitle: 'Advanced',
    webPort: 'Dashboard port',
    encTitle: 'Encryption key:',
    encText: 'generated at install, it encrypts your pilots’ tokens. If you regenerate it, you will have to link them again.',
    encRegenerate: 'Regenerate the key',
    encConfirm: 'Regenerate the encryption key? You will have to link all your pilots again.',
    encChanged: 'New key: after saving, link your pilots again on the Pilots page.',
    configFile: 'Settings',
    dataDir: 'Data (your history)',
    logDir: 'Logs',
    open: 'Open',
    saveFirst: 'Save and open the ledger',
    save: 'Save and restart',
    saving: 'Saving…',
    cancel: 'Cancel',
    errorsTitle: 'Check these fields:',
    err_clientId: 'This build has no EVE application: build it with EVE_LEDGER_CLIENT_ID (see apps/desktop/README.md).',
    webPortHint: 'Where the dashboard opens, on this computer only.',
    err_bundledPort: "The included EVE application only works with API port 47300 (API_PORT in the configuration file).",
    err_encKey: 'The encryption key is not valid: regenerate it under “Advanced”.',
    err_ports: 'Ports must be different and greater than 1023.',
    err_numbers: 'Pilots and PLEX per month must be at least 1.',
    startingTitle: 'Starting IskPulse…',
    startingText: 'Preparing the database and the dashboard. It takes a few seconds.',
    errorTitle: 'IskPulse could not start',
    err_port: (p) => `Port ${p} is used by another program (another IskPulse?). Close it or change the port in Settings → Advanced.`,
    err_exited: (name) => `The ${name === 'api' ? 'API' : 'dashboard'} closed while starting. Its log says:`,
    err_timeout: 'The services did not answer in time. Retry or check the logs.',
    err_other: 'Unexpected error:',
    retry: 'Retry',
    openSettings: 'Settings',
    openLogs: 'Open the logs',
  },
  de: {
    setupTitle: 'IskPulse einrichten',
    settingsTitle: 'Einstellungen',
    settingsLead: 'Änderungen werden in deiner Einstellungsdatei gespeichert und starten den Ledger neu.',
    setupLead: "IskPulse läuft nur auf deinem Rechner: Er speichert deine EVE-Tokens verschlüsselt mit einem hier erzeugten Schlüssel und sendet nichts an andere außer den ESI-Aufrufen.",
    prefsTitle: 'Einstellungen',
    pilotSlots: 'Piloten, die du verknüpfst',
    pilotSlotsHint: 'Plätze auf der Pilotenseite. Du kannst mehr verknüpfen.',
    syncInterval: 'Synchronisieren alle (Minuten)',
    syncIntervalHint: '0 = nur manuell. ESI aktualisiert stündlich: unter 60 bringt keine frischeren Daten.',
    omegaAccounts: 'Omega-Accounts',
    omegaAccountsHint: 'Für den Indikator „Omega für alle Accounts“.',
    omegaPlex: 'PLEX pro Omega-Monat',
    omegaPlexHint: 'Was ein Monat Omega pro Account kostet.',
    esiContact: 'Kontakt für ESI (optional)',
    esiContactHint: 'Dein EVE-Name oder eine E-Mail. CCP möchte dich erreichen können, falls etwas schiefgeht.',
    backgroundTitle: 'Im Hintergrund',
    backgroundLead: 'ESI speichert nur etwa 30 Tage Wallet-Historie: Tage, an denen IskPulse nicht läuft, lassen sich später nicht nachholen.',
    startAtLogin: 'IskPulse bei der Anmeldung öffnen',
    startAtLoginHint: 'Startet im Infobereich, ohne Fenster, und synchronisiert, auch wenn du es nicht öffnest.',
    closeToTray: 'Beim Schließen des Fensters im Infobereich weiterlaufen',
    closeToTrayHint: 'Synchronisiert weiter. Zum vollständigen Beenden: Beenden im Symbol im Infobereich oder im Menü.',
    advancedTitle: 'Erweitert',
    webPort: 'Dashboard-Port',
    encTitle: 'Verschlüsselungsschlüssel:',
    encText: 'bei der Installation erzeugt, verschlüsselt die Tokens deiner Piloten. Wenn du ihn neu erzeugst, musst du sie neu verknüpfen.',
    encRegenerate: 'Schlüssel neu erzeugen',
    encConfirm: 'Verschlüsselungsschlüssel neu erzeugen? Du musst alle Piloten neu verknüpfen.',
    encChanged: 'Neuer Schlüssel: nach dem Speichern die Piloten auf der Pilotenseite neu verknüpfen.',
    configFile: 'Einstellungen',
    dataDir: 'Daten (dein Verlauf)',
    logDir: 'Protokolle',
    open: 'Öffnen',
    saveFirst: 'Speichern und Ledger öffnen',
    save: 'Speichern und neu starten',
    saving: 'Speichern…',
    cancel: 'Abbrechen',
    errorsTitle: 'Prüfe diese Felder:',
    err_clientId: 'Dieser Build enthält keine EVE-Anwendung: mit EVE_LEDGER_CLIENT_ID bauen (siehe apps/desktop/README.md).',
    webPortHint: 'Wo sich das Dashboard öffnet, nur auf diesem Rechner.',
    err_bundledPort: "Die enthaltene EVE-Anwendung funktioniert nur mit API-Port 47300 (API_PORT in der Konfigurationsdatei).",
    err_encKey: 'Der Verschlüsselungsschlüssel ist ungültig: unter „Erweitert“ neu erzeugen.',
    err_ports: 'Die Ports müssen verschieden und größer als 1023 sein.',
    err_numbers: 'Piloten und PLEX pro Monat müssen mindestens 1 sein.',
    startingTitle: 'IskPulse startet…',
    startingText: 'Datenbank und Dashboard werden vorbereitet. Das dauert ein paar Sekunden.',
    errorTitle: 'IskPulse konnte nicht starten',
    err_port: (p) => `Port ${p} wird von einem anderen Programm benutzt (ein anderer IskPulse?). Schließe es oder ändere den Port unter Einstellungen → Erweitert.`,
    err_exited: (name) => `${name === 'api' ? 'Die API' : 'Das Dashboard'} wurde beim Start beendet. Das Protokoll sagt:`,
    err_timeout: 'Die Dienste haben nicht rechtzeitig geantwortet. Erneut versuchen oder die Protokolle ansehen.',
    err_other: 'Unerwarteter Fehler:',
    retry: 'Erneut versuchen',
    openSettings: 'Einstellungen',
    openLogs: 'Protokolle öffnen',
  },
  pt: {
    setupTitle: 'Configure seu IskPulse',
    settingsTitle: 'Configurações',
    settingsLead: 'As mudanças são salvas no seu arquivo de configuração e reiniciam o ledger.',
    setupLead: "O IskPulse roda só no seu computador: guarda os tokens do EVE criptografados com uma chave gerada aqui e não envia nada a ninguém além das chamadas à ESI.",
    prefsTitle: 'Preferências',
    pilotSlots: 'Pilotos que você vai vincular',
    pilotSlotsHint: 'Vagas na página de pilotos. Você pode vincular mais.',
    syncInterval: 'Sincronizar a cada (minutos)',
    syncIntervalHint: '0 = só manual. A ESI atualiza a cada hora: menos de 60 não traz dados mais recentes.',
    omegaAccounts: 'Contas Ômega',
    omegaAccountsHint: 'Para o indicador “Ômega de todas as contas”.',
    omegaPlex: 'PLEX por mês de Ômega',
    omegaPlexHint: 'Quanto custa um mês de Ômega de cada conta.',
    esiContact: 'Contato para a ESI (opcional)',
    esiContactHint: 'Seu nome no EVE ou um e-mail. A CCP pede para poder avisar se algo der errado.',
    backgroundTitle: 'Em segundo plano',
    backgroundLead: 'A ESI só guarda uns 30 dias de carteira: os dias em que o IskPulse não está aberto não podem ser recuperados depois.',
    startAtLogin: 'Abrir o IskPulse ao entrar no sistema',
    startAtLoginHint: 'Inicia na bandeja do sistema, sem janela, e sincroniza mesmo que você não o abra.',
    closeToTray: 'Ao fechar a janela, continuar na bandeja',
    closeToTrayHint: 'Continua sincronizando. Para sair de vez, use “Sair” no ícone da bandeja ou no menu.',
    advancedTitle: 'Avançado',
    webPort: 'Porta do dashboard',
    encTitle: 'Chave de criptografia:',
    encText: 'foi gerada na instalação e criptografa os tokens dos seus pilotos. Se você a gerar de novo, terá que vinculá-los outra vez.',
    encRegenerate: 'Gerar a chave de novo',
    encConfirm: 'Gerar de novo a chave de criptografia? Você terá que vincular todos os seus pilotos outra vez.',
    encChanged: 'Chave nova: depois de salvar, vincule seus pilotos outra vez na página Pilotos.',
    configFile: 'Configurações',
    dataDir: 'Dados (seu histórico)',
    logDir: 'Registros',
    open: 'Abrir',
    saveFirst: 'Salvar e abrir o ledger',
    save: 'Salvar e reiniciar',
    saving: 'Salvando…',
    cancel: 'Cancelar',
    errorsTitle: 'Confira estes campos:',
    err_clientId: 'Esta compilação não traz o aplicativo do EVE: compile com EVE_LEDGER_CLIENT_ID (veja apps/desktop/README.md).',
    webPortHint: 'Onde o dashboard abre, só neste computador.',
    err_bundledPort: "O aplicativo do EVE incluído só funciona com a porta 47300 da API (API_PORT no arquivo de configuração).",
    err_encKey: 'A chave de criptografia não é válida: gere outra em “Avançado”.',
    err_ports: 'As portas precisam ser diferentes e maiores que 1023.',
    err_numbers: 'Os pilotos e os PLEX por mês precisam ser pelo menos 1.',
    startingTitle: 'Iniciando o IskPulse…',
    startingText: 'Preparando o banco de dados e o dashboard. Leva alguns segundos.',
    errorTitle: 'O IskPulse não conseguiu iniciar',
    err_port: (p) => `A porta ${p} está sendo usada por outro programa (outra cópia do IskPulse?). Feche-o ou mude a porta em Configurações → Avançado.`,
    err_exited: (name) => `${name === 'api' ? 'A API' : 'O dashboard'} fechou ao iniciar. O registro diz:`,
    err_timeout: 'Os serviços não responderam a tempo. Tente de novo ou veja os registros.',
    err_other: 'Erro inesperado:',
    retry: 'Tentar de novo',
    openSettings: 'Configurações',
    openLogs: 'Abrir os registros',
  },
  zh: {
    setupTitle: '设置你的 IskPulse',
    settingsTitle: '设置',
    settingsLead: '更改会保存到你的配置文件，并重启账本。',
    setupLead: 'IskPulse 只在你的电脑上运行：它用在这里生成的密钥加密保存你的 EVE 令牌，除了 ESI 调用，不向任何人发送任何东西。',
    prefsTitle: '偏好',
    pilotSlots: '你要绑定的飞行员数',
    pilotSlotsHint: '飞行员页面上的空位数。可以绑定更多。',
    syncInterval: '同步间隔（分钟）',
    syncIntervalHint: '0 = 仅手动。ESI 每小时更新：低于 60 也拿不到更新的数据。',
    omegaAccounts: '欧米伽账号数',
    omegaAccountsHint: '用于“所有账号的欧米伽”指标。',
    omegaPlex: '每月欧米伽所需 PLEX',
    omegaPlexHint: '每个账号一个月欧米伽的花费。',
    esiContact: 'ESI 联系方式（可选）',
    esiContactHint: '你的 EVE 名字或邮箱。CCP 需要它，以便出问题时联系你。',
    backgroundTitle: '后台运行',
    backgroundLead: 'ESI 只保留约 30 天的钱包历史：IskPulse 没在运行的日子，之后无法补回。',
    startAtLogin: '登录系统时打开 IskPulse',
    startAtLoginHint: '在系统托盘中启动，不显示窗口，即使你不打开它也会同步。',
    closeToTray: '关闭窗口时继续在托盘中运行',
    closeToTrayHint: '会继续同步。要完全退出，请使用托盘图标或菜单中的“退出”。',
    advancedTitle: '高级',
    webPort: '仪表盘端口',
    encTitle: '加密密钥：',
    encText: '安装时生成，用于加密你飞行员的令牌。如果重新生成，你需要重新绑定他们。',
    encRegenerate: '重新生成密钥',
    encConfirm: '重新生成加密密钥？你需要重新绑定所有飞行员。',
    encChanged: '新密钥：保存后，请在“飞行员”页面重新绑定你的飞行员。',
    configFile: '设置',
    dataDir: '数据（你的历史）',
    logDir: '日志',
    open: '打开',
    saveFirst: '保存并打开账本',
    save: '保存并重启',
    saving: '正在保存…',
    cancel: '取消',
    errorsTitle: '请检查这些字段：',
    err_clientId: '此版本未包含 EVE 应用：请用 EVE_LEDGER_CLIENT_ID 编译（见 apps/desktop/README.md）。',
    webPortHint: '仪表盘的打开位置，仅限本机。',
    err_bundledPort: '内置的 EVE 应用只能使用 API 端口 47300（配置文件中的 API_PORT）。',
    err_encKey: '加密密钥无效：请在“高级”中重新生成。',
    err_ports: '端口必须互不相同且大于 1023。',
    err_numbers: '飞行员数和每月 PLEX 至少为 1。',
    startingTitle: '正在启动 IskPulse…',
    startingText: '正在准备数据库和仪表盘。需要几秒钟。',
    errorTitle: 'IskPulse 无法启动',
    err_port: (p) => `端口 ${p} 被另一个程序占用（另一个 IskPulse？）。请关闭它，或在 设置 → 高级 中更改端口。`,
    err_exited: (name) => `${name === 'api' ? 'API' : '仪表盘'}在启动时退出。其日志显示：`,
    err_timeout: '服务未能及时响应。请重试或查看日志。',
    err_other: '意外错误：',
    retry: '重试',
    openSettings: '设置',
    openLogs: '打开日志',
  },
  ru: {
    setupTitle: 'Настрой свой IskPulse',
    settingsTitle: 'Настройки',
    settingsLead: 'Изменения сохраняются в файле настроек и перезапускают учёт.',
    setupLead: 'IskPulse работает только на твоём компьютере: хранит токены EVE зашифрованными ключом, созданным здесь, и никому ничего не отправляет, кроме запросов к ESI.',
    prefsTitle: 'Параметры',
    pilotSlots: 'Сколько пилотов привяжешь',
    pilotSlotsHint: 'Слоты на странице пилотов. Можно привязать больше.',
    syncInterval: 'Синхронизировать каждые (минут)',
    syncIntervalHint: '0 = только вручную. ESI обновляется раз в час: меньше 60 не даёт более свежих данных.',
    omegaAccounts: 'Аккаунтов с Омегой',
    omegaAccountsHint: 'Для показателя «Омега для всех аккаунтов».',
    omegaPlex: 'PLEX за месяц Омеги',
    omegaPlexHint: 'Сколько стоит месяц Омеги на один аккаунт.',
    esiContact: 'Контакт для ESI (необязательно)',
    esiContactHint: 'Твоё имя в EVE или email. CCP просит его, чтобы связаться, если что-то сломается.',
    backgroundTitle: 'В фоне',
    backgroundLead: 'ESI хранит историю кошелька только около 30 дней: дни, когда IskPulse не запущен, потом не восстановить.',
    startAtLogin: 'Открывать IskPulse при входе в систему',
    startAtLoginHint: 'Запускается в системном трее, без окна, и синхронизирует, даже если ты его не открываешь.',
    closeToTray: 'При закрытии окна оставаться в трее',
    closeToTrayHint: 'Синхронизация продолжается. Чтобы выйти совсем, выбери «Выход» в значке в трее или в меню.',
    advancedTitle: 'Дополнительно',
    webPort: 'Порт дашборда',
    encTitle: 'Ключ шифрования:',
    encText: 'создан при установке и шифрует токены твоих пилотов. Если создашь новый, их придётся привязать заново.',
    encRegenerate: 'Создать новый ключ',
    encConfirm: 'Создать новый ключ шифрования? Всех пилотов придётся привязать заново.',
    encChanged: 'Новый ключ: после сохранения привяжи пилотов заново на странице «Пилоты».',
    configFile: 'Настройки',
    dataDir: 'Данные (твоя история)',
    logDir: 'Журналы',
    open: 'Открыть',
    saveFirst: 'Сохранить и открыть учёт',
    save: 'Сохранить и перезапустить',
    saving: 'Сохранение…',
    cancel: 'Отмена',
    errorsTitle: 'Проверь эти поля:',
    err_clientId: 'В этой сборке нет приложения EVE: собери её с EVE_LEDGER_CLIENT_ID (см. apps/desktop/README.md).',
    webPortHint: 'Где открывается дашборд, только на этом компьютере.',
    err_bundledPort: 'Встроенное приложение EVE работает только с портом API 47300 (API_PORT в файле настроек).',
    err_encKey: 'Ключ шифрования недействителен: создай новый в разделе «Дополнительно».',
    err_ports: 'Порты должны различаться и быть больше 1023.',
    err_numbers: 'Пилотов и PLEX в месяц должно быть не меньше 1.',
    startingTitle: 'Запуск IskPulse…',
    startingText: 'Готовим базу данных и дашборд. Это займёт несколько секунд.',
    errorTitle: 'IskPulse не удалось запустить',
    err_port: (p) => `Порт ${p} занят другой программой (ещё один IskPulse?). Закрой её или смени порт в «Настройки → Дополнительно».`,
    err_exited: (name) => `${name === 'api' ? 'API' : 'Дашборд'} закрылся при запуске. Вот что в его журнале:`,
    err_timeout: 'Сервисы не ответили вовремя. Повтори или проверь журналы.',
    err_other: 'Непредвиденная ошибка:',
    retry: 'Повторить',
    openSettings: 'Настройки',
    openLogs: 'Открыть журналы',
  },
};

const lang = (() => {
  const l = (navigator.language || 'es').slice(0, 2).toLowerCase();
  return l in T ? l : 'es';
})();
const t = T[lang];
document.documentElement.lang = { pt: 'pt-BR', zh: 'zh-CN' }[lang] ?? lang;

// Tauri or, with ?preview, a stand-in to view the page in a browser
const preview = !window.__TAURI__;
const tauri = preview
  ? {
      invoke: async (cmd, args) => {
        if (cmd === 'get_state')
          return {
            configured: location.search.includes('configured'),
            config: { clientId: 'preview', encKey: 'x'.repeat(43) + '=', esiContact: '', syncIntervalMin: 60, pilotSlots: 5, omegaAccounts: 5, omegaPlexPerMonth: 500, apiPort: 47300, webPort: 47321, startAtLogin: true, closeToTray: true },
            configPath: '~/.config/net.eveledger.desktop/ledger.env',
            dataDir: '~/.local/share/net.eveledger.desktop',
            logDir: '~/.local/share/net.eveledger.desktop/logs',
            version: '0.1.0',
            status: location.search.includes('error')
              ? { state: 'error', message: 'exited:api:Some(1)\nerror: Falta la variable de entorno EVE_CLIENT_ID' }
              : { state: 'setup' },
          };
        if (cmd === 'new_enc_key') return 'y'.repeat(43) + '=';
        if (cmd === 'save_config') return args.config.clientId ? [] : ['clientId'];
        return null;
      },
      listen: async () => {},
      label: location.search.includes('settings') ? 'settings' : 'main',
      close: () => window.close(),
    }
  : {
      invoke: window.__TAURI__.core.invoke,
      listen: window.__TAURI__.event.listen,
      label: window.__TAURI__.window.getCurrentWindow().label,
      close: () => window.__TAURI__.window.getCurrentWindow().close(),
    };

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const form = $('#setup');
const starting = $('#starting');
let state;
let originalKey = '';

for (const el of $$('[data-t]')) el.textContent = t[el.dataset.t];

function show(view) {
  form.hidden = view !== 'setup';
  starting.hidden = view !== 'starting';
  window.scrollTo(0, 0);
}

function fill(cfg) {
  for (const [k, v] of Object.entries(cfg)) {
    const input = form.elements.namedItem(k);
    if (!input) continue;
    if (input.type === 'checkbox') input.checked = !!v;
    else input.value = v;
  }
  originalKey = cfg.encKey;
}

// The EVE app (Client ID only: no Secret Key, PKCE) and the API port aren't edited here: they come from the
// saved configuration (the app bundled in the installer, or the one set up by whoever configured it in earlier versions)
function readForm() {
  const f = form.elements;
  const num = (name) => Math.max(0, Math.floor(Number(f[name].value) || 0));
  return {
    clientId: state.config.clientId,
    encKey: f.encKey.value.trim(),
    esiContact: f.esiContact.value.trim(),
    syncIntervalMin: num('syncIntervalMin'),
    pilotSlots: num('pilotSlots'),
    omegaAccounts: num('omegaAccounts'),
    omegaPlexPerMonth: num('omegaPlexPerMonth'),
    apiPort: state.config.apiPort,
    webPort: num('webPort'),
    startAtLogin: f.startAtLogin.checked,
    closeToTray: f.closeToTray.checked,
  };
}

const FIELD_OF = { ports: 'webPort', numbers: 'pilotSlots' };

function showErrors(errors) {
  const box = $('[data-errors]');
  for (const input of $$('input', form)) input.removeAttribute('aria-invalid');
  if (!errors.length) {
    box.hidden = true;
    return;
  }
  box.innerHTML = `<p>${t.errorsTitle}</p><ul>${errors.map((e) => `<li>${t['err_' + e] ?? e}</li>`).join('')}</ul>`;
  box.hidden = false;
  for (const e of errors) form.elements.namedItem(FIELD_OF[e] ?? '')?.setAttribute('aria-invalid', 'true');
  if (errors.some((e) => ['encKey', 'ports'].includes(e))) $('.advanced').open = true;
  form.elements.namedItem(FIELD_OF[errors[0]] ?? '')?.focus();
}

function renderStatus(status) {
  const failed = status.state === 'error';
  $('[data-starting-title]').textContent = failed ? t.errorTitle : t.startingTitle;
  const log = $('[data-starting-log]');
  log.hidden = true;
  let text = t.startingText;
  if (failed) {
    const msg = status.message ?? '';
    const [head, ...rest] = msg.split('\n');
    if (head.startsWith('port:')) text = t.err_port(head.slice(5));
    else if (head.startsWith('exited:')) {
      text = t.err_exited(head.split(':')[1]);
      log.textContent = rest.join('\n') || head;
      log.hidden = false;
    } else if (head === 'timeout') text = t.err_timeout;
    else {
      text = t.err_other;
      log.textContent = msg;
      log.hidden = false;
    }
  }
  $('[data-starting-text]').textContent = text;
  $('[data-starting-actions]').hidden = !failed;
}

async function init() {
  state = await tauri.invoke('get_state');
  $('[data-version]').textContent = `v${state.version}`;
  for (const el of $$('[data-path]')) el.textContent = state[el.dataset.path];
  fill(state.config);

  const settingsWindow = tauri.label === 'settings';
  const firstRun = !state.configured;
  $('h1', form).textContent = firstRun ? t.setupTitle : t.settingsTitle;
  $('.lead', form).textContent = firstRun ? t.setupLead : t.settingsLead;
  $('[data-save]').textContent = firstRun ? t.saveFirst : t.save;
  $('[data-cancel]').hidden = !settingsWindow && firstRun;
  document.title = firstRun ? `IskPulse · ${t.setupTitle}` : `IskPulse · ${t.settingsTitle}`;

  if (settingsWindow || firstRun || state.status.state === 'setup') show('setup');
  else {
    renderStatus(state.status);
    show('starting');
  }

  await tauri.listen('ledger-status', (e) => {
    if (tauri.label !== 'main') return;
    renderStatus(e.payload);
    if (e.payload.state !== 'setup' && form.hidden === false && e.payload.state !== 'ready') show('starting');
  });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const button = $('[data-save]');
  const label = button.textContent;
  button.disabled = true;
  button.textContent = t.saving;
  try {
    const errors = await tauri.invoke('save_config', { config: readForm() });
    showErrors(errors);
    if (!errors.length && tauri.label === 'main') {
      renderStatus({ state: 'starting' });
      show('starting');
    }
  } catch (err) {
    showErrors([]);
    $('[data-errors]').hidden = false;
    $('[data-errors]').textContent = `${t.err_other} ${err}`;
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
});

$('[data-regenerate]').addEventListener('click', async () => {
  if (!confirm(t.encConfirm)) return;
  form.elements.encKey.value = await tauri.invoke('new_enc_key');
  $('[data-enc-changed]').hidden = form.elements.encKey.value === originalKey;
});

for (const b of $$('[data-dir]')) b.addEventListener('click', () => tauri.invoke('open_dir', { which: b.dataset.dir }));
$('[data-cancel]').addEventListener('click', () => {
  if (tauri.label === 'settings') tauri.close();
  else {
    renderStatus(state.status);
    show(state.status.state === 'setup' ? 'setup' : 'starting');
  }
});
$('[data-retry]').addEventListener('click', () => {
  renderStatus({ state: 'starting' });
  tauri.invoke('retry');
});
$('[data-to-settings]').addEventListener('click', () => {
  $('[data-cancel]').hidden = false;
  show('setup');
});

init();
