// Asistente y configuración de EVE Ledger de escritorio. Habla con Rust (src-tauri/src/lib.rs) con invoke().
// Sin Tauri (abriendo la página en un navegador con ?preview) usa datos de ejemplo, para revisar el diseño.

const SCOPES = [
  'esi-wallet.read_character_wallet.v1',
  'esi-assets.read_assets.v1',
  'esi-killmails.read_killmails.v1',
  'esi-contracts.read_character_contracts.v1',
];

const T = {
  es: {
    setupTitle: 'Configura tu EVE Ledger',
    settingsTitle: 'Configuración',
    setupLead:
      'EVE Ledger corre solo en tu equipo: guarda los tokens de EVE cifrados con una clave que se genera aquí y no envía nada a nadie salvo las llamadas a ESI. Para conectarse con EVE necesita una aplicación tuya en el portal de desarrolladores de CCP (gratis, dos minutos).',
    settingsLead: 'Los cambios se guardan en tu archivo de configuración y reinician el ledger.',
    appTitle: 'Tu aplicación de EVE',
    step1: 'Entra en el portal de desarrolladores de EVE con tu cuenta y crea una aplicación.',
    openDevSite: 'Abrir developers.eveonline.com',
    step2: 'Ponle cualquier nombre (por ejemplo «EVE Ledger») y elige «Authentication & API Access».',
    step3: 'Añade estos cuatro permisos (scopes):',
    copyScopes: 'Copiar los permisos',
    step4: 'Como «Callback URL», pega exactamente esta:',
    callbackHint: 'Si cambias el puerto de la API en «Avanzado», cambia también la URL en tu aplicación de EVE.',
    step5: 'Crea la aplicación y copia aquí su «Client ID» y su «Secret Key».',
    clientId: 'Client ID',
    clientSecret: 'Secret Key',
    show: 'Ver',
    hide: 'Ocultar',
    copy: 'Copiar',
    copied: 'Copiado',
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
    advancedTitle: 'Avanzado',
    apiPort: 'Puerto de la API',
    apiPortHint: 'Forma parte de la Callback URL.',
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
    err_clientId: 'Falta el Client ID de tu aplicación de EVE.',
    err_clientSecret: 'Falta la Secret Key de tu aplicación de EVE.',
    err_encKey: 'La clave de cifrado no es válida: regenérala en «Avanzado».',
    err_ports: 'Los puertos tienen que ser distintos y mayores que 1023.',
    err_numbers: 'Los pilotos y los PLEX por mes tienen que ser al menos 1.',
    startingTitle: 'Arrancando EVE Ledger…',
    startingText: 'Preparando la base de datos y el dashboard. Tarda unos segundos.',
    errorTitle: 'EVE Ledger no pudo arrancar',
    err_port: (p) => `El puerto ${p} lo está usando otro programa (¿otra copia de EVE Ledger?). Ciérralo o cambia el puerto en Configuración → Avanzado.`,
    err_exited: (name) => `${name === 'api' ? 'La API' : 'El dashboard'} se cerró al arrancar. Esto dice su registro:`,
    err_timeout: 'Los servicios no respondieron a tiempo. Reintenta o mira los registros.',
    err_other: 'Error inesperado:',
    retry: 'Reintentar',
    openSettings: 'Configuración',
    openLogs: 'Abrir los registros',
  },
  en: {
    setupTitle: 'Set up your EVE Ledger',
    settingsTitle: 'Settings',
    setupLead:
      'EVE Ledger runs only on your computer: it stores your EVE tokens encrypted with a key generated here and sends nothing anywhere except ESI calls. To talk to EVE it needs your own application on CCP’s developer portal (free, two minutes).',
    settingsLead: 'Changes are saved to your settings file and restart the ledger.',
    appTitle: 'Your EVE application',
    step1: 'Sign in to the EVE developer portal with your account and create an application.',
    openDevSite: 'Open developers.eveonline.com',
    step2: 'Give it any name (for example “EVE Ledger”) and choose “Authentication & API Access”.',
    step3: 'Add these four permissions (scopes):',
    copyScopes: 'Copy the permissions',
    step4: 'As “Callback URL”, paste exactly this one:',
    callbackHint: 'If you change the API port under “Advanced”, change the URL in your EVE application too.',
    step5: 'Create the application and paste its “Client ID” and “Secret Key” here.',
    clientId: 'Client ID',
    clientSecret: 'Secret Key',
    show: 'Show',
    hide: 'Hide',
    copy: 'Copy',
    copied: 'Copied',
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
    advancedTitle: 'Advanced',
    apiPort: 'API port',
    apiPortHint: 'It is part of the Callback URL.',
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
    err_clientId: 'Your EVE application’s Client ID is missing.',
    err_clientSecret: 'Your EVE application’s Secret Key is missing.',
    err_encKey: 'The encryption key is not valid: regenerate it under “Advanced”.',
    err_ports: 'Ports must be different and greater than 1023.',
    err_numbers: 'Pilots and PLEX per month must be at least 1.',
    startingTitle: 'Starting EVE Ledger…',
    startingText: 'Preparing the database and the dashboard. It takes a few seconds.',
    errorTitle: 'EVE Ledger could not start',
    err_port: (p) => `Port ${p} is used by another program (another EVE Ledger?). Close it or change the port in Settings → Advanced.`,
    err_exited: (name) => `The ${name === 'api' ? 'API' : 'dashboard'} closed while starting. Its log says:`,
    err_timeout: 'The services did not answer in time. Retry or check the logs.',
    err_other: 'Unexpected error:',
    retry: 'Retry',
    openSettings: 'Settings',
    openLogs: 'Open the logs',
  },
  de: {
    setupTitle: 'EVE Ledger einrichten',
    settingsTitle: 'Einstellungen',
    setupLead:
      'EVE Ledger läuft nur auf deinem Rechner: Es speichert deine EVE-Tokens verschlüsselt mit einem hier erzeugten Schlüssel und sendet nichts außer ESI-Aufrufen. Um mit EVE zu sprechen, braucht es deine eigene Anwendung im Entwicklerportal von CCP (kostenlos, zwei Minuten).',
    settingsLead: 'Änderungen werden in deiner Einstellungsdatei gespeichert und starten den Ledger neu.',
    appTitle: 'Deine EVE-Anwendung',
    step1: 'Melde dich im EVE-Entwicklerportal an und erstelle eine Anwendung.',
    openDevSite: 'developers.eveonline.com öffnen',
    step2: 'Gib ihr einen beliebigen Namen (z. B. „EVE Ledger“) und wähle „Authentication & API Access“.',
    step3: 'Füge diese vier Berechtigungen (Scopes) hinzu:',
    copyScopes: 'Berechtigungen kopieren',
    step4: 'Als „Callback URL“ genau diese einfügen:',
    callbackHint: 'Wenn du den API-Port unter „Erweitert“ änderst, ändere auch die URL in deiner EVE-Anwendung.',
    step5: 'Erstelle die Anwendung und füge hier „Client ID“ und „Secret Key“ ein.',
    clientId: 'Client ID',
    clientSecret: 'Secret Key',
    show: 'Zeigen',
    hide: 'Verbergen',
    copy: 'Kopieren',
    copied: 'Kopiert',
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
    advancedTitle: 'Erweitert',
    apiPort: 'API-Port',
    apiPortHint: 'Teil der Callback URL.',
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
    err_clientId: 'Die Client ID deiner EVE-Anwendung fehlt.',
    err_clientSecret: 'Der Secret Key deiner EVE-Anwendung fehlt.',
    err_encKey: 'Der Verschlüsselungsschlüssel ist ungültig: unter „Erweitert“ neu erzeugen.',
    err_ports: 'Die Ports müssen verschieden und größer als 1023 sein.',
    err_numbers: 'Piloten und PLEX pro Monat müssen mindestens 1 sein.',
    startingTitle: 'EVE Ledger startet…',
    startingText: 'Datenbank und Dashboard werden vorbereitet. Das dauert ein paar Sekunden.',
    errorTitle: 'EVE Ledger konnte nicht starten',
    err_port: (p) => `Port ${p} wird von einem anderen Programm benutzt (ein anderer EVE Ledger?). Schließe es oder ändere den Port unter Einstellungen → Erweitert.`,
    err_exited: (name) => `${name === 'api' ? 'Die API' : 'Das Dashboard'} wurde beim Start beendet. Das Protokoll sagt:`,
    err_timeout: 'Die Dienste haben nicht rechtzeitig geantwortet. Erneut versuchen oder die Protokolle ansehen.',
    err_other: 'Unerwarteter Fehler:',
    retry: 'Erneut versuchen',
    openSettings: 'Einstellungen',
    openLogs: 'Protokolle öffnen',
  },
};

const lang = (() => {
  const l = (navigator.language || 'es').toLowerCase();
  return l.startsWith('de') ? 'de' : l.startsWith('en') ? 'en' : 'es';
})();
const t = T[lang];
document.documentElement.lang = lang;

// Tauri o, con ?preview, un sustituto para ver la página en un navegador
const preview = !window.__TAURI__;
const tauri = preview
  ? {
      invoke: async (cmd, args) => {
        if (cmd === 'get_state')
          return {
            configured: location.search.includes('configured'),
            config: { clientId: '', clientSecret: '', encKey: 'x'.repeat(43) + '=', esiContact: '', syncIntervalMin: 60, pilotSlots: 5, omegaAccounts: 5, omegaPlexPerMonth: 500, apiPort: 47300, webPort: 47321 },
            callbackUrl: 'http://127.0.0.1:47300/auth/callback',
            configPath: '~/.config/net.eveledger.desktop/ledger.env',
            dataDir: '~/.local/share/net.eveledger.desktop',
            logDir: '~/.local/share/net.eveledger.desktop/logs',
            version: '0.1.0',
            status: location.search.includes('error')
              ? { state: 'error', message: 'exited:api:Some(1)\nerror: Falta la variable de entorno EVE_CLIENT_ID' }
              : { state: 'setup' },
          };
        if (cmd === 'callback_url_for') return `http://127.0.0.1:${args.port}/auth/callback`;
        if (cmd === 'new_enc_key') return 'y'.repeat(43) + '=';
        if (cmd === 'save_config') return args.config.clientId ? [] : ['clientId', 'clientSecret'];
        return null;
      },
      listen: async () => {},
      label: location.search.includes('settings') ? 'settings' : 'main',
      openUrl: (url) => window.open(url, '_blank'),
      close: () => window.close(),
    }
  : {
      invoke: window.__TAURI__.core.invoke,
      listen: window.__TAURI__.event.listen,
      label: window.__TAURI__.window.getCurrentWindow().label,
      openUrl: (url) => window.__TAURI__.opener.openUrl(url),
      close: () => window.__TAURI__.window.getCurrentWindow().close(),
    };

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const form = $('#setup');
const starting = $('#starting');
let state;
let originalKey = '';

for (const el of $$('[data-t]')) el.textContent = t[el.dataset.t];
$('[data-scopes]').innerHTML = SCOPES.map((s) => `<li>${s}</li>`).join('');

function show(view) {
  form.hidden = view !== 'setup';
  starting.hidden = view !== 'starting';
  window.scrollTo(0, 0);
}

function fill(cfg) {
  for (const [k, v] of Object.entries(cfg)) {
    const input = form.elements.namedItem(k);
    if (input) input.value = v;
  }
  originalKey = cfg.encKey;
}

async function updateCallback() {
  const port = Number(form.elements.apiPort.value) || 47300;
  $('#callback').value = await tauri.invoke('callback_url_for', { port });
}

function readForm() {
  const f = form.elements;
  const num = (name) => Math.max(0, Math.floor(Number(f[name].value) || 0));
  return {
    clientId: f.clientId.value.trim(),
    clientSecret: f.clientSecret.value.trim(),
    encKey: f.encKey.value.trim(),
    esiContact: f.esiContact.value.trim(),
    syncIntervalMin: num('syncIntervalMin'),
    pilotSlots: num('pilotSlots'),
    omegaAccounts: num('omegaAccounts'),
    omegaPlexPerMonth: num('omegaPlexPerMonth'),
    apiPort: num('apiPort'),
    webPort: num('webPort'),
  };
}

const FIELD_OF = { clientId: 'clientId', clientSecret: 'clientSecret', ports: 'apiPort', numbers: 'pilotSlots' };

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
  if (errors.includes('encKey') || errors.includes('ports')) $('.advanced').open = true;
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
  await updateCallback();

  const settingsWindow = tauri.label === 'settings';
  const firstRun = !state.configured;
  $('h1', form).textContent = firstRun ? t.setupTitle : t.settingsTitle;
  $('.lead', form).textContent = firstRun ? t.setupLead : t.settingsLead;
  $('[data-save]').textContent = firstRun ? t.saveFirst : t.save;
  $('[data-cancel]').hidden = !settingsWindow && firstRun;
  document.title = firstRun ? `EVE Ledger · ${t.setupTitle}` : `EVE Ledger · ${t.settingsTitle}`;

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

form.elements.apiPort.addEventListener('input', updateCallback);

$('[data-reveal]').addEventListener('click', (e) => {
  const input = form.elements.clientSecret;
  const visible = input.type === 'text';
  input.type = visible ? 'password' : 'text';
  e.currentTarget.textContent = visible ? t.show : t.hide;
});

$('[data-regenerate]').addEventListener('click', async () => {
  if (!confirm(t.encConfirm)) return;
  form.elements.encKey.value = await tauri.invoke('new_enc_key');
  $('[data-enc-changed]').hidden = form.elements.encKey.value === originalKey;
});

async function copy(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const label = button.textContent;
    button.textContent = t.copied;
    setTimeout(() => (button.textContent = label), 1500);
  } catch {
    /* sin portapapeles: el texto sigue a la vista para copiarlo a mano */
  }
}

$('[data-copy]').addEventListener('click', (e) => copy($('#callback').value, e.currentTarget));
$('[data-copy-scopes]').addEventListener('click', (e) => copy(SCOPES.join(' '), e.currentTarget));
for (const b of $$('[data-open]')) b.addEventListener('click', () => tauri.openUrl(b.dataset.open));
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
