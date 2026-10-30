/* =========================================================
   CandidTrack – logique de l'application (JavaScript natif)
   ========================================================= */

// Clé utilisée pour enregistrer les données dans localStorage
const STORAGE_KEY = "candidtrack_applications";

// Correspondance statut -> classe CSS du badge
const STATUS_CLASS = {
  "À préparer": "s-prep",
  "Envoyée": "s-sent",
  "Entretien": "s-interview",
  "Acceptée": "s-accepted",
  "Refusée": "s-rejected",
};
const STATUSES = Object.keys(STATUS_CLASS);

// Liste des candidatures en mémoire
let applications = loadApplications();

/* ---------- Raccourcis vers les éléments HTML ---------- */
const $ = (id) => document.getElementById(id);
const form = $("application-form");
const searchInput = $("search-input");
const filterStatus = $("filter-status");
const sortDate = $("sort-date");

/* ---------- Stockage ---------- */
function loadApplications() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}
function saveApplications() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(applications));
}

/* ---------- Utilitaires ---------- */
// Échappe le texte pour éviter l'injection de HTML
function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function badge(status) {
  return `<span class="badge ${STATUS_CLASS[status]}">${escapeHTML(status)}</span>`;
}
function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
}

/* ---------- Navigation entre sections (sans rechargement) ---------- */
function showSection(name) {
  document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"));
  $("section-" + name).classList.add("active");
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.classList.toggle("active", link.dataset.section === name);
  });
  // Ouvrir "Ajouter" depuis le menu réinitialise le formulaire
  if (name === "add" && !$("app-id").value) resetForm();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
document.querySelectorAll("[data-section]").forEach((btn) =>
  btn.addEventListener("click", () => {
    if (btn.dataset.section === "add") resetForm();
    showSection(btn.dataset.section);
  })
);
document.querySelectorAll("[data-goto]").forEach((btn) =>
  btn.addEventListener("click", () => {
    if (btn.dataset.goto === "add") resetForm();
    showSection(btn.dataset.goto);
  })
);

/* ---------- Tableau de bord ---------- */
function renderDashboard() {
  const count = (status) => applications.filter((a) => a.status === status).length;
  $("stat-total").textContent = applications.length;
  // "Envoyées" = toutes celles qui ne sont plus "À préparer"
  $("stat-sent").textContent = applications.filter((a) => a.status !== "À préparer").length;
  $("stat-interview").textContent = count("Entretien");
  $("stat-accepted").textContent = count("Acceptée");

  // 5 candidatures les plus récentes
  const recent = [...applications].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  $("recent-list").innerHTML = recent
    .map(
      (a) => `<li>
        <div><strong>${escapeHTML(a.position)}</strong>
        <small>${escapeHTML(a.company)} · ${escapeHTML(a.type)} · ${formatDate(a.date)}</small></div>
        ${badge(a.status)}
      </li>`
    )
    .join("");
  $("recent-empty").classList.toggle("visible", applications.length === 0);
}

/* ---------- Liste des candidatures ---------- */
function getVisibleApplications() {
  const query = searchInput.value.trim().toLowerCase();
  const status = filterStatus.value;
  const order = sortDate.value;

  return applications
    .filter((a) =>
      !query ||
      a.company.toLowerCase().includes(query) ||
      a.position.toLowerCase().includes(query)
    )
    .filter((a) => status === "all" || a.status === status)
    .sort((a, b) => (order === "asc" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)));
}

function renderList() {
  const list = getVisibleApplications();
  $("applications-body").innerHTML = list
    .map(
      (a) => `<tr>
        <td><strong>${escapeHTML(a.company)}</strong>
          ${a.link ? `<br><a href="${escapeHTML(a.link)}" target="_blank" rel="noopener">Voir l'offre</a>` : ""}</td>
        <td>${escapeHTML(a.position)}</td>
        <td>${escapeHTML(a.type)}</td>
        <td>${formatDate(a.date)}</td>
        <td>
          <select class="status-select" data-id="${a.id}" aria-label="Changer le statut">
            ${STATUSES.map((s) => `<option ${s === a.status ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </td>
        <td class="actions">
          <button class="icon-btn" data-edit="${a.id}" title="Modifier" type="button">✏️</button>
          <button class="icon-btn" data-delete="${a.id}" title="Supprimer" type="button">🗑️</button>
        </td>
      </tr>`
    )
    .join("");

  const empty = $("list-empty");
  empty.textContent = applications.length === 0
    ? "Aucune candidature pour le moment. Cliquez sur « Nouvelle candidature »."
    : "Aucune candidature ne correspond à votre recherche.";
  empty.classList.toggle("visible", list.length === 0);
}

// Met à jour toute l'interface
function renderAll() {
  renderDashboard();
  renderList();
}

/* ---------- Actions sur le tableau (délégation d'événements) ---------- */
$("applications-body").addEventListener("click", (e) => {
  const editId = e.target.closest("[data-edit]")?.dataset.edit;
  const deleteId = e.target.closest("[data-delete]")?.dataset.delete;
  if (editId) startEdit(editId);
  if (deleteId) deleteApplication(deleteId);
});
$("applications-body").addEventListener("change", (e) => {
  if (!e.target.classList.contains("status-select")) return;
  const app = applications.find((a) => a.id === e.target.dataset.id);
  if (!app) return;
  app.status = e.target.value;
  saveApplications();
  renderAll();
  showToast("Statut mis à jour");
});

function deleteApplication(id) {
  const app = applications.find((a) => a.id === id);
  if (!app) return;
  if (!confirm(`Supprimer la candidature chez « ${app.company} » ?`)) return;
  applications = applications.filter((a) => a.id !== id);
  saveApplications();
  renderAll();
  showToast("Candidature supprimée");
}

/* ---------- Formulaire ---------- */
function resetForm() {
  form.reset();
  $("app-id").value = "";
  $("date").value = new Date().toISOString().slice(0, 10);
  $("form-title").textContent = "Ajouter une candidature";
  $("submit-btn").textContent = "Enregistrer";
  $("form-error").textContent = "";
}

function startEdit(id) {
  const app = applications.find((a) => a.id === id);
  if (!app) return;
  $("app-id").value = app.id;
  $("company").value = app.company;
  $("position").value = app.position;
  $("type").value = app.type;
  $("date").value = app.date;
  $("status").value = app.status;
  $("link").value = app.link;
  $("notes").value = app.notes;
  $("form-title").textContent = "Modifier la candidature";
  $("submit-btn").textContent = "Mettre à jour";
  $("form-error").textContent = "";
  showSection("add");
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = {
    company: $("company").value.trim(),
    position: $("position").value.trim(),
    type: $("type").value,
    date: $("date").value,
    status: $("status").value,
    link: $("link").value.trim(),
    notes: $("notes").value.trim(),
  };

  // Validation simple
  if (!data.company || !data.position || !data.date) {
    $("form-error").textContent = "Veuillez remplir les champs obligatoires (*).";
    return;
  }
  if (data.link && !/^https?:\/\//i.test(data.link)) {
    $("form-error").textContent = "Le lien doit commencer par http:// ou https://";
    return;
  }

  const id = $("app-id").value;
  if (id) {
    // Modification
    const index = applications.findIndex((a) => a.id === id);
    applications[index] = { ...applications[index], ...data };
    showToast("Candidature modifiée");
  } else {
    // Ajout
    applications.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ...data });
    showToast("Candidature ajoutée");
  }

  saveApplications();
  resetForm();
  renderAll();
  showSection("applications");
});

$("cancel-btn").addEventListener("click", () => {
  resetForm();
  showSection("applications");
});

/* ---------- Recherche, filtre, tri ---------- */
[searchInput, filterStatus, sortDate].forEach((el) => el.addEventListener("input", renderList));

/* ---------- Démarrage ---------- */
resetForm();
renderAll();
