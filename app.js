/* ==========================================================================
   ClientFlow — app.js
   Núcleo do sistema: acesso a dados (localStorage), utilitários, layout,
   toasts e modais. Carregado em todas as páginas do painel.
   ========================================================================== */

(function (global) {
  "use strict";

  const API_BASE_URL = "https://buying-printed-fold-electronics.trycloudflare.com";
  const THEME_KEY = "cf_theme";

  function getPreferredTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }

  function applyTheme(theme) {
    const resolved = theme === "system" ? getPreferredTheme() : theme;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themePreference = theme === "system" ? "system" : resolved;
  }

  function setTheme(theme) {
    if (theme === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
    document.dispatchEvent(new CustomEvent("cf:theme-change", { detail: theme }));
  }

  applyTheme(localStorage.getItem(THEME_KEY) || "system");

  /* ---------------------------------------------------------------------
     Chaves de armazenamento
     ------------------------------------------------------------------- */
  const KEYS = {
    clients: "cf_clients",
    installments: "cf_installments",
    forms: "cf_forms",
    responses: "cf_responses",
    seeded: "cf_seeded_v1"
  };

  /* ---------------------------------------------------------------------
     Helpers de armazenamento
     ------------------------------------------------------------------- */
  function readArray(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error("ClientFlow: falha ao ler " + key, e);
      return [];
    }
  }

  function writeArray(key, arr) {
    try {
      localStorage.setItem(key, JSON.stringify(arr));
      return true;
    } catch (e) {
      console.error("ClientFlow: falha ao gravar " + key, e);
      return false;
    }
  }

  function uid(prefix) {
    const rand = Math.random().toString(36).slice(2, 9);
    const time = Date.now().toString(36).slice(-4);
    return (prefix ? prefix + "_" : "") + time + rand;
  }

  function token() {
    return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
  }

  function nowISO() {
    return new Date().toISOString();
  }

  /* ---------------------------------------------------------------------
     Camada de dados (DB)
     ------------------------------------------------------------------- */
  const DB = {
    KEYS: KEYS,

    // ---- Clientes ----
    getClients() {
      return readArray(KEYS.clients);
    },
    getClient(id) {
      return this.getClients().find((c) => c.id === id) || null;
    },
    saveClients(arr) {
      return writeArray(KEYS.clients, arr);
    },
    addClient(data) {
      const clients = this.getClients();
      const client = Object.assign(
        {
          id: uid("cli"),
          createdAt: nowISO(),
          name: "",
          company: "",
          whatsapp: "",
          email: "",
          instagram: "",
          notes: "",
          formId: null,
          project: { name: "", type: "", status: "novo" },
          financial: {
            totalValue: 0,
            paymentMethod: "pix",
            paymentType: "avista",
            installmentsCount: 1
          }
        },
        data
      );
      clients.push(client);
      this.saveClients(clients);
      return client;
    },
    updateClient(id, data) {
      const clients = this.getClients();
      const idx = clients.findIndex((c) => c.id === id);
      if (idx === -1) return null;
      clients[idx] = Object.assign({}, clients[idx], data);
      this.saveClients(clients);
      return clients[idx];
    },
    deleteClient(id) {
      const clients = this.getClients().filter((c) => c.id !== id);
      this.saveClients(clients);
      const installments = this.getInstallments().filter((p) => p.clientId !== id);
      this.saveInstallments(installments);
      const forms = this.getForms().filter((f) => f.clientId !== id);
      this.saveForms(forms);
    },

    // ---- Parcelas ----
    getInstallments() {
      return readArray(KEYS.installments);
    },
    saveInstallments(arr) {
      return writeArray(KEYS.installments, arr);
    },
    getInstallmentsByClient(clientId) {
      return this.getInstallments()
        .filter((p) => p.clientId === clientId)
        .sort((a, b) => a.number - b.number);
    },
    createInstallmentsForClient(clientId, totalValue, count, firstDueDate) {
      // Remove parcelas antigas do cliente antes de recriar
      let installments = this.getInstallments().filter((p) => p.clientId !== clientId);

      const n = Math.max(1, parseInt(count, 10) || 1);
      const totalCents = Math.round(Number(totalValue) * 100);
      const baseCents = Math.floor(totalCents / n);
      const remainder = totalCents - baseCents * n;

      const base = firstDueDate ? new Date(firstDueDate + "T00:00:00") : new Date();

      for (let i = 0; i < n; i++) {
        const due = new Date(base.getTime());
        due.setMonth(due.getMonth() + i);
        const cents = baseCents + (i === n - 1 ? remainder : 0);
        installments.push({
          id: uid("parc"),
          clientId: clientId,
          number: i + 1,
          value: cents / 100,
          dueDate: due.toISOString().slice(0, 10),
          status: "pendente"
        });
      }
      this.saveInstallments(installments);
      return this.getInstallmentsByClient(clientId);
    },
    markInstallmentStatus(id, status) {
      const installments = this.getInstallments();
      const idx = installments.findIndex((p) => p.id === id);
      if (idx === -1) return null;
      installments[idx].status = status;
      this.saveInstallments(installments);
      return installments[idx];
    },

    // ---- Formulários ----
    getForms() {
      return readArray(KEYS.forms);
    },
    saveForms(arr) {
      return writeArray(KEYS.forms, arr);
    },
    getForm(id) {
      return this.getForms().find((f) => f.id === id) || null;
    },
    getFormByToken(tok) {
      return this.getForms().find((f) => f.token === tok) || null;
    },
    addForm(data) {
      const forms = this.getForms();
      const form = Object.assign(
        {
          id: uid("form"),
          clientId: null,
          title: "Briefing de projeto",
          token: token(),
          status: "nao_enviado",
          createdAt: nowISO(),
          respondedAt: null,
          steps: []
        },
        data
      );
      forms.push(form);
      this.saveForms(forms);
      return form;
    },
    updateForm(id, data) {
      const forms = this.getForms();
      const idx = forms.findIndex((f) => f.id === id);
      if (idx === -1) return null;
      forms[idx] = Object.assign({}, forms[idx], data);
      this.saveForms(forms);
      return forms[idx];
    },
    deleteForm(id) {
      this.saveForms(this.getForms().filter((f) => f.id !== id));
      this.saveResponses(this.getResponses().filter((r) => r.formId !== id));
    },

    // ---- Respostas ----
    getResponses() {
      return readArray(KEYS.responses);
    },
    saveResponses(arr) {
      return writeArray(KEYS.responses, arr);
    },
    getResponseByForm(formId) {
      return this.getResponses().find((r) => r.formId === formId) || null;
    },
    addResponse(data) {
      const responses = this.getResponses();
      const response = Object.assign(
        { id: uid("resp"), formId: null, clientId: null, answers: {}, submittedAt: nowISO() },
        data
      );
      responses.push(response);
      this.saveResponses(responses);
      return response;
    }
  };

  /* ---------------------------------------------------------------------
     Formatação
     ------------------------------------------------------------------- */
  function formatCurrency(value) {
    const n = Number(value) || 0;
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function formatDate(isoOrDateStr) {
    if (!isoOrDateStr) return "—";
    const d = isoOrDateStr.length === 10 ? new Date(isoOrDateStr + "T00:00:00") : new Date(isoOrDateStr);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("pt-BR");
  }

  function formatMonthLabel(year, month) {
    const d = new Date(year, month, 1);
    const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  function qs(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  const STATUS_LABELS = {
    novo: "Novo",
    em_negociacao: "Em negociação",
    em_desenvolvimento: "Em desenvolvimento",
    aguardando_cliente: "Aguardando cliente",
    concluido: "Concluído",
    cancelado: "Cancelado"
  };

  const SITE_TYPE_LABELS = {
    landing: "Landing Page",
    institucional: "Institucional",
    portfolio: "Portfólio",
    loja: "Loja virtual",
    blog: "Blog",
    outro: "Outro"
  };

  const PAYMENT_METHOD_LABELS = { pix: "PIX", cartao: "Cartão" };
  const FORM_STATUS_LABELS = { nao_enviado: "Não enviado", enviado: "Enviado", respondido: "Respondido" };

  /* ---------------------------------------------------------------------
     Ícones SVG (conjunto mínimo, sem bibliotecas externas)
     ------------------------------------------------------------------- */
  const ICONS = {
    dashboard:
      '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="8" height="8" rx="2" stroke="currentColor" stroke-width="1.7"/><rect x="13" y="3" width="8" height="5" rx="2" stroke="currentColor" stroke-width="1.7"/><rect x="13" y="10" width="8" height="11" rx="2" stroke="currentColor" stroke-width="1.7"/><rect x="3" y="13" width="8" height="8" rx="2" stroke="currentColor" stroke-width="1.7"/></svg>',
    clients:
      '<svg viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3.2" stroke="currentColor" stroke-width="1.7"/><path d="M3.5 20c0-3.3 2.7-5.6 5.9-5.6 1.4 0 2.6.4 3.6 1.1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="17" cy="9" r="2.6" stroke="currentColor" stroke-width="1.7"/><path d="M14.8 14.9c2.9.2 5.7 2 5.7 5.1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    forms:
      '<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    settings:
      '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.7"/><path d="M19.4 13a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H4a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H10a1.7 1.7 0 0 0 1-1.5V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H20a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" stroke="currentColor" stroke-width="1.5"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    search:
      '<svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none"><path d="M9.5 14.5l5-5M8 15.5l-1.5 1.5a3.5 3.5 0 0 1-5-5L3 10.5M16 8.5L17.5 7a3.5 3.5 0 0 1 5 5L21 13.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="2.6" stroke="currentColor" stroke-width="1.7"/></svg>',
    trash:
      '<svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.8 12.2a2 2 0 0 1-2 1.8H8.8a2 2 0 0 1-2-1.8L6 7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 20l.9-4 10-10 3.1 3.1-10 10-4 .9z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M13.5 6.5l3.1 3.1" stroke="currentColor" stroke-width="1.6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 12.5l5 5L20 7" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    money:
      '<svg viewBox="0 0 24 24" fill="none"><rect x="2.5" y="6" width="19" height="12" rx="2" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="2.6" stroke="currentColor" stroke-width="1.6"/><path d="M6 8v.01M18 16v.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    pending:
      '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M12 7v5l3.3 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    projects:
      '<svg viewBox="0 0 24 24" fill="none"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h5l2 2.5H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 18.5H5.5A1.5 1.5 0 0 1 4 17z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    upload:
      '<svg viewBox="0 0 24 24" fill="none"><path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    empty:
      '<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="7" width="16" height="13" rx="2" stroke="currentColor" stroke-width="1.4"/><path d="M4 11h16M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" stroke="currentColor" stroke-width="1.4"/></svg>'
  };

  function icon(name, cls) {
    return '<span class="icon' + (cls ? " " + cls : "") + '">' + (ICONS[name] || "") + "</span>";
  }

  /* ---------------------------------------------------------------------
     Toasts
     ------------------------------------------------------------------- */
  function ensureToastHost() {
    let host = document.querySelector(".toast-host");
    if (!host) {
      host = document.createElement("div");
      host.className = "toast-host";
      document.body.appendChild(host);
    }
    return host;
  }

  function toast(message, type) {
    const host = ensureToastHost();
    const el = document.createElement("div");
    el.className = "toast toast--" + (type || "default");
    el.innerHTML =
      '<span class="toast__icon">' + (ICONS[type === "success" ? "check" : type === "error" ? "close" : "money"]) + "</span>" +
      '<span class="toast__text"></span>';
    el.querySelector(".toast__text").textContent = message;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add("is-visible"));
    setTimeout(() => {
      el.classList.remove("is-visible");
      setTimeout(() => el.remove(), 220);
    }, 2600);
  }

  /* ---------------------------------------------------------------------
     Modal de confirmação genérico
     ------------------------------------------------------------------- */
  function confirmDialog(opts) {
    const options = Object.assign(
      { title: "Confirmar ação", message: "Tem certeza?", confirmLabel: "Confirmar", danger: false },
      opts
    );
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "modal-overlay";
      overlay.innerHTML =
        '<div class="modal" role="dialog" aria-modal="true">' +
        '<h3 class="modal__title"></h3>' +
        '<p class="modal__text"></p>' +
        '<div class="modal__actions">' +
        '<button type="button" class="btn btn--ghost" data-act="cancel">Cancelar</button>' +
        '<button type="button" class="btn ' + (options.danger ? "btn--danger" : "btn--primary") + '" data-act="confirm"></button>' +
        "</div></div>";
      overlay.querySelector(".modal__title").textContent = options.title;
      overlay.querySelector(".modal__text").textContent = options.message;
      overlay.querySelector('[data-act="confirm"]').textContent = options.confirmLabel;
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add("is-visible"));

      function close(result) {
        overlay.classList.remove("is-visible");
        setTimeout(() => overlay.remove(), 180);
        resolve(result);
      }
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close(false);
      });
      overlay.querySelector('[data-act="cancel"]').addEventListener("click", () => close(false));
      overlay.querySelector('[data-act="confirm"]').addEventListener("click", () => close(true));
    });
  }

  /* ---------------------------------------------------------------------
     Layout: sidebar + topbar
     ------------------------------------------------------------------- */
  const NAV_ITEMS = [
    { href: "index.html", label: "Dashboard", icon: "dashboard", match: ["index.html", ""] },
    { href: "clientes.html", label: "Clientes", icon: "clients", match: ["clientes.html", "cliente.html", "novo-cliente.html", "editar-cliente.html"] },
    { href: "formularios.html", label: "Formulários", icon: "forms", match: ["formularios.html", "criar-formulario.html"] },
    { href: "respostas.html", label: "Respostas", icon: "eye", match: ["respostas.html"] }
  ];

  function currentPage() {
    const path = window.location.pathname.split("/").pop();
    return path || "index.html";
  }

  function renderShell(pageTitle) {
    const page = currentPage();
    const body = document.body;
    body.classList.add("has-shell");

    const shell = document.createElement("div");
    shell.className = "shell";

    const navHTML = NAV_ITEMS.map((item) => {
      const active = item.match.indexOf(page) !== -1;
      return (
        '<a class="nav-item' + (active ? " is-active" : "") + '" href="' + item.href + '">' +
        icon(item.icon) +
        '<span>' + item.label + "</span></a>"
      );
    }).join("");

    shell.innerHTML =
      '<aside class="sidebar">' +
      '<div class="sidebar__brand"><span class="sidebar__mark">CF</span><span class="sidebar__name">ClientFlow</span></div>' +
      '<nav class="sidebar__nav">' + navHTML + "</nav>" +
      '<div class="sidebar__footer">' +
      '<a class="nav-item nav-item--muted" href="#" data-role="settings">' + icon("settings") + "<span>Configurações</span></a>" +
      "</div>" +
      "</aside>" +
      '<div class="shell__main">' +
      '<header class="topbar"><button class="topbar__menu" type="button" aria-label="Abrir menu">' + icon("dashboard") + "</button>" +
      '<h1 class="topbar__title"></h1>' +
      '<div class="topbar__slot"><button class="icon-btn" type="button" data-role="theme" aria-label="Alternar tema" title="Alternar tema">' + icon("settings") + "</button></div>" +
      "</header>" +
      '<main class="content" id="content"></main>' +
      "</div>";

    document.body.insertBefore(shell, document.body.firstChild);
    shell.querySelector(".topbar__title").textContent = pageTitle || "";

    const settingsLink = shell.querySelector('[data-role="settings"]');
    if (page === "configuracoes.html") settingsLink.classList.add("is-active");
    settingsLink.addEventListener("click", (e) => {
      e.preventDefault();
      window.location.href = "configuracoes.html";
    });

    shell.querySelector('[data-role="theme"]').addEventListener("click", () => {
      setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
      toast("Tema atualizado", "success");
    });

    const menuBtn = shell.querySelector(".topbar__menu");
    menuBtn.addEventListener("click", () => shell.classList.toggle("sidebar-open"));

    return document.getElementById("content");
  }

  function emptyState(iconName, title, text, actionHTML) {
    return (
      '<div class="empty-state">' +
      '<div class="empty-state__icon">' + (ICONS[iconName] || ICONS.empty) + "</div>" +
      '<h3 class="empty-state__title">' + title + "</h3>" +
      '<p class="empty-state__text">' + text + "</p>" +
      (actionHTML || "") +
      "</div>"
    );
  }

  function escapeHTML(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));
  }

  /* ---------------------------------------------------------------------
     Exposição global
     ------------------------------------------------------------------- */
  global.CF = {
    DB,
    API_BASE_URL,
    uid,
    token,
    nowISO,
    formatCurrency,
    formatDate,
    formatMonthLabel,
    qs,
    icon,
    ICONS,
    toast,
    confirmDialog,
    renderShell,
    getPreferredTheme,
    applyTheme,
    setTheme,
    emptyState,
    escapeHTML,
    STATUS_LABELS,
    SITE_TYPE_LABELS,
    PAYMENT_METHOD_LABELS,
    FORM_STATUS_LABELS
  };
})(window);
