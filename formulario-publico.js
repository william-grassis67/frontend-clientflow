/* ==========================================================================
   ClientFlow — formulario-publico.js
   Renderiza o formulário público de briefing (formulario.html?token=...)
   como um assistente multi-etapas, sem sidebar nem dashboard.
   ========================================================================== */

(function (global) {
  "use strict";
  const CF = global.CF;
  const DB = CF.DB;

  function init() {
    const root = document.getElementById("public-form-root");
    const tok = CF.qs("token");
    const form = tok ? DB.getFormByToken(tok) : null;

    if (!form) {
      root.innerHTML = invalidState("Link inválido", "Este link de formulário não existe ou foi removido. Confira com quem enviou o link.");
      return;
    }

    const client = DB.getClient(form.clientId);
    const existingResponse = DB.getResponseByForm(form.id);

    if (existingResponse) {
      root.innerHTML = successState(client);
      return;
    }

    runWizard(root, form, client);
  }

  function invalidState(title, text) {
    return (
      '<div class="public-status">' +
      '<div class="public-status__icon">' + CF.icon("close") + "</div>" +
      "<h1>" + title + "</h1><p>" + text + "</p>" +
      "</div>"
    );
  }

  function successState(client) {
    return (
      '<div class="public-status public-status--success">' +
      '<div class="public-status__icon">' + CF.icon("check") + "</div>" +
      "<h1>Briefing enviado com sucesso</h1>" +
      "<p>Recebemos as informações do seu projeto. Agora vamos analisar todos os detalhes.</p>" +
      (client ? '<p class="public-status__sub">Obrigado, ' + CF.escapeHTML(client.name.split(" ")[0]) + ".</p>" : "") +
      "</div>"
    );
  }

  function runWizard(root, form, client) {
    const steps = form.steps;
    let current = 0;
    const answers = {};

    root.innerHTML =
      '<div class="public-form">' +
      '<header class="public-form__head">' +
      '<span class="public-form__brand">' + (client && client.company ? CF.escapeHTML(client.company) : "ClientFlow") + "</span>" +
      '<span class="public-form__step-label" id="step-label"></span>' +
      "</header>" +
      '<div class="public-form__progress"><div class="public-form__progress-bar" id="progress-bar"></div></div>' +
      '<div class="public-form__body" id="step-body"></div>' +
      '<footer class="public-form__footer">' +
      '<button type="button" class="btn btn--ghost" id="btn-back">' + CF.icon("back") + "<span>Voltar</span></button>" +
      '<button type="button" class="btn btn--primary" id="btn-next"><span>Continuar</span></button>' +
      "</footer></div>";

    const stepLabel = root.querySelector("#step-label");
    const progressBar = root.querySelector("#progress-bar");
    const stepBody = root.querySelector("#step-body");
    const backBtn = root.querySelector("#btn-back");
    const nextBtn = root.querySelector("#btn-next");

    function renderStep() {
      const step = steps[current];
      stepLabel.textContent = "Etapa " + (current + 1) + " de " + steps.length;
      progressBar.style.width = Math.round(((current + 1) / steps.length) * 100) + "%";
      backBtn.hidden = current === 0;
      nextBtn.querySelector("span").textContent = current === steps.length - 1 ? "Enviar briefing" : "Continuar";

      if (step.intro) {
        stepBody.innerHTML =
          '<div class="public-intro">' +
          "<h1>" + CF.escapeHTML(step.title) + "</h1>" +
          "<p>" + CF.escapeHTML(step.description || "") + "</p>" +
          "</div>";
        return;
      }

      stepBody.innerHTML =
        "<h1>" + CF.escapeHTML(step.title) + "</h1>" +
        '<div class="public-questions">' + step.questions.map(renderQuestion).join("") + "</div>";

      // Restaura valores já preenchidos ao voltar
      step.questions.forEach((question) => {
        const saved = answers[question.id];
        if (saved === undefined) return;
        applyAnswerToDOM(stepBody, question, saved);
      });

      // Uploads: exibe nomes de arquivos ao selecionar
      stepBody.querySelectorAll('input[type="file"]').forEach((input) => {
        input.addEventListener("change", () => {
          const files = Array.from(input.files || []).map((f) => ({ name: f.name, size: f.size }));
          answers[input.dataset.qid] = files;
          const list = input.closest(".question").querySelector(".file-list");
          list.textContent = files.length ? files.map((f) => f.name).join(", ") : "Nenhum arquivo selecionado";
        });
      });
    }

    function applyAnswerToDOM(container, question, value) {
      const wrap = container.querySelector('[data-question="' + question.id + '"]');
      if (!wrap) return;
      if (question.type === "single") {
        const input = wrap.querySelector('input[value="' + cssEscape(value) + '"]');
        if (input) input.checked = true;
      } else if (question.type === "multi" && Array.isArray(value)) {
        value.forEach((v) => {
          const input = wrap.querySelector('input[value="' + cssEscape(v) + '"]');
          if (input) input.checked = true;
        });
      } else if (question.type === "upload") {
        const list = wrap.querySelector(".file-list");
        if (list && Array.isArray(value)) list.textContent = value.map((f) => f.name).join(", ");
      } else {
        const input = wrap.querySelector("input, textarea");
        if (input) input.value = value;
      }
    }

    function cssEscape(v) {
      return String(v).replace(/"/g, '\\"');
    }

    function renderQuestion(question) {
      const label =
        '<label class="question__label">' + CF.escapeHTML(question.title) + (question.required ? ' <em>*</em>' : "") + "</label>" +
        (question.description ? '<p class="question__desc">' + CF.escapeHTML(question.description) + "</p>" : "");

      let field = "";
      switch (question.type) {
        case "textarea":
          field = '<textarea rows="4" data-qid="' + question.id + '"></textarea>';
          break;
        case "single":
          field = question.options
            .map(
              (opt, i) =>
                '<label class="option-pill"><input type="radio" name="' + question.id + '" value="' + CF.escapeHTML(opt) + '" data-qid="' + question.id + '" /><span>' + CF.escapeHTML(opt) + "</span></label>"
            )
            .join("");
          field = '<div class="option-group">' + field + "</div>";
          break;
        case "multi":
          field = question.options
            .map(
              (opt) =>
                '<label class="option-pill"><input type="checkbox" name="' + question.id + '" value="' + CF.escapeHTML(opt) + '" data-qid="' + question.id + '" /><span>' + CF.escapeHTML(opt) + "</span></label>"
            )
            .join("");
          field = '<div class="option-group">' + field + "</div>";
          break;
        case "color":
          field = '<input type="color" data-qid="' + question.id + '" value="#4f7cff" />';
          break;
        case "url":
          field = '<input type="url" data-qid="' + question.id + '" placeholder="https://" />';
          break;
        case "upload":
          field =
            '<label class="upload-field"><input type="file" multiple data-qid="' + question.id + '" />' +
            '<span class="upload-field__cta">' + CF.icon("upload") + "<span>Selecionar arquivos</span></span></label>" +
            '<p class="file-list">Nenhum arquivo selecionado</p>';
          break;
        default:
          field = '<input type="text" data-qid="' + question.id + '" />';
      }

      return '<div class="question" data-question="' + question.id + '">' + label + field + "</div>";
    }

    function collectStep(step) {
      let valid = true;
      let firstInvalid = null;

      step.questions.forEach((question) => {
        const wrap = stepBody.querySelector('[data-question="' + question.id + '"]');
        let value;

        if (question.type === "single") {
          const checked = wrap.querySelector("input:checked");
          value = checked ? checked.value : "";
        } else if (question.type === "multi") {
          value = Array.from(wrap.querySelectorAll("input:checked")).map((i) => i.value);
        } else if (question.type === "upload") {
          value = answers[question.id] || [];
        } else {
          const input = wrap.querySelector("input, textarea");
          value = input ? input.value.trim() : "";
        }

        answers[question.id] = value;

        const isEmpty = value === "" || (Array.isArray(value) && value.length === 0);
        if (question.required && isEmpty) {
          valid = false;
          wrap.classList.add("question--error");
          if (!firstInvalid) firstInvalid = wrap;
        } else {
          wrap.classList.remove("question--error");
        }
      });

      if (!valid && firstInvalid) {
        firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return valid;
    }

    nextBtn.addEventListener("click", () => {
      const step = steps[current];
      if (!step.intro && !collectStep(step)) {
        CF.toast("Preencha os campos obrigatórios para continuar", "error");
        return;
      }
      if (current < steps.length - 1) {
        current += 1;
        renderStep();
        stepBody.scrollTo && root.scrollTo(0, 0);
      } else {
        submit();
      }
    });

    backBtn.addEventListener("click", () => {
      if (current > 0) {
        current -= 1;
        renderStep();
      }
    });

    function submit() {
      DB.addResponse({ formId: form.id, clientId: form.clientId, answers: answers });
      DB.updateForm(form.id, { status: "respondido", respondedAt: CF.nowISO() });
      root.innerHTML = successState(client);
    }

    renderStep();
  }

  document.addEventListener("DOMContentLoaded", init);
})(window);
