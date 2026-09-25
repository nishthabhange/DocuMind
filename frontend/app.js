const $ = (id) => document.getElementById(id);
let db, session, currentDocId = null;

// ---------- Helpers ----------
function esc(text) {
    const d = document.createElement("div");
    d.textContent = text ?? "";
    return d.innerHTML;
}

async function api(path, options = {}) {
    const headers = { Authorization: `Bearer ${session.access_token}` };
    if (options.json) {
        headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(options.json);
    }
    const response = await fetch(path, { method: "GET", ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) await logout();
    if (!response.ok) throw new Error(data.detail || "Something went wrong.");
    return data;
}

const fmtSize = (b) => !b ? "0 KB" : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(2)} MB`;
const fmtLabel = (s) => s.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
const list = (id, items, empty = "Nothing to show.") =>
    $(id).innerHTML = (items?.length ? items : [empty]).map((i) => `<li>${esc(i)}</li>`).join("");

// ---------- Navigation ----------
function show(view) {
    document.querySelectorAll(".view").forEach((v) => v.hidden = v.id !== `view-${view}`);
    const tab = view === "analysis" ? "documents" : view;
    document.querySelectorAll("#nav button[data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === tab));
    if (view === "documents") loadDocuments();
    if (view === "chat") loadChatDocs();
    if (view === "stats") loadStats();
}
document.querySelectorAll("#nav button[data-view]").forEach((b) => b.onclick = () => show(b.dataset.view));
$("backButton").onclick = () => show("documents");

// ---------- Auth (Supabase Auth) ----------
let signUpMode = false;

function setAuthStatus(message, isError = false) {
    $("authStatus").textContent = message;
    $("authStatus").className = "status" + (isError ? " error" : "");
}

const withTimeout = (promise, ms = 15000) => Promise.race([promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(
        "The request timed out. Check your Supabase URL, key and internet connection.")), ms))]);

async function start() {
    try {
        if (typeof supabase === "undefined") throw new Error("Could not load the login library. Check your internet connection and refresh.");
        const response = await fetch("/api/config");
        if (!response.ok) throw new Error("Could not reach the DocuMind server. Is it running on port 8000?");
        const config = await response.json();
        db = supabase.createClient(config.supabase_url, config.supabase_key);
        const { data } = await db.auth.getSession();
        setSession(data.session);
        db.auth.onAuthStateChange((_event, s) => { session = s; });   // keeps token refreshed
    } catch (error) {
        setAuthStatus(error.message, true);
    }
}

function setSession(s) {
    session = s;
    $("authView").hidden = !!s;
    $("nav").hidden = !s;
    $("userEmail").textContent = s?.user?.email || "";
    document.querySelectorAll(".view").forEach((v) => v.hidden = true);
    if (s) show("documents");
}

function setMode(signUp) {
    signUpMode = signUp;
    $("tabLogin").classList.toggle("active", !signUp);
    $("tabSignup").classList.toggle("active", signUp);
    $("authTitle").textContent = signUp ? "Create your account" : "Welcome back";
    $("authHint").textContent = signUp ? "Sign up to start analyzing documents." : "Log in to open your documents.";
    $("authSubmit").textContent = signUp ? "Create account" : "Log in";
    $("confirmRow").hidden = !signUp;
    $("confirmPassword").required = signUp;
    $("password").autocomplete = signUp ? "new-password" : "current-password";
    $("switchText").textContent = signUp ? "Already have an account?" : "New to DocuMind?";
    $("switchLink").textContent = signUp ? "Log in" : "Create an account";
    setAuthStatus("");
}
$("tabLogin").onclick = () => setMode(false);
$("tabSignup").onclick = () => setMode(true);
$("switchLink").onclick = () => setMode(!signUpMode);
$("togglePassword").onclick = () => {
    const hidden = $("password").type === "password";
    $("password").type = hidden ? "text" : "password";
    $("togglePassword").textContent = hidden ? "Hide" : "Show";
};

$("authForm").onsubmit = async (e) => {
    e.preventDefault();
    if (!db) { setAuthStatus("Not connected yet. Refresh the page and try again.", true); return; }
    const email = $("email").value.trim(), password = $("password").value;
    if (signUpMode && password !== $("confirmPassword").value) { setAuthStatus("Passwords do not match.", true); return; }
    $("authSubmit").disabled = true;
    setAuthStatus("Please wait...");
    try {
        const call = signUpMode ? db.auth.signUp({ email, password }) : db.auth.signInWithPassword({ email, password });
        const { data, error } = await withTimeout(call);
        if (error) throw error;
        if (!data.session) {   // email confirmation is switched on in Supabase
            setMode(false);
            setAuthStatus("Account created. Check your email to confirm it, then log in.");
            return;
        }
        $("authForm").reset();
        setAuthStatus("");
        setSession(data.session);
    } catch (error) {
        setAuthStatus(error.message || "Something went wrong. Try again.", true);
    } finally {
        $("authSubmit").disabled = false;
    }
};

async function logout() { await db.auth.signOut(); setSession(null); }
$("logoutButton").onclick = logout;

// ---------- Documents ----------
async function loadDocuments() {
    const docs = await api("/api/documents");
    $("docList").innerHTML = docs.length ? docs.map((d) => `
        <div class="doc-row">
            <button class="doc-open" data-id="${d.id}">
                <span class="badge">${esc(d.file_type)}</span>
                <span class="doc-info"><strong>${esc(d.original_filename)}</strong>
                <span>${d.page_count} pages · ${fmtSize(d.file_size_bytes)} · ${esc(d.document_type || "Document")}</span></span>
            </button>
            <button class="secondary-button" data-delete="${d.id}">Delete</button>
        </div>`).join("") : `<p class="muted-text">No documents yet. Upload one above.</p>`;
}

$("docList").onclick = async (e) => {
    const open = e.target.closest("[data-id]"), del = e.target.closest("[data-delete]");
    if (open) openDocument(open.dataset.id);
    if (del && confirm("Delete this document and its search data?")) {
        await api(`/api/documents/${del.dataset.delete}`, { method: "DELETE" });
        loadDocuments();
    }
};

$("fileInput").onchange = async () => {
    const file = $("fileInput").files[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { $("uploadStatus").textContent = "File is larger than the 20 MB limit."; return; }
    const form = new FormData();
    form.append("file", file);
    $("uploadStatus").textContent = "Uploading, reading, indexing, and analyzing... this can take a minute.";
    try {
        const doc = await api("/api/documents", { method: "POST", body: form });
        $("uploadStatus").textContent = "";
        showAnalysis(doc);
    } catch (error) {
        $("uploadStatus").textContent = `Error: ${error.message}`;
    }
    $("uploadForm").reset();
};

async function openDocument(id) { showAnalysis(await api(`/api/documents/${id}`)); }

function showAnalysis(doc) {
    currentDocId = doc.id;
    show("analysis");
    $("documentName").textContent = doc.original_filename;
    $("uploadedTime").textContent = `Analyzed on ${new Date(doc.created_at).toLocaleString()}`;
    $("metrics").innerHTML = [["Pages", doc.page_count], ["File Type", doc.file_type],
        ["Category", doc.document_type || "-"], ["File Size", fmtSize(doc.file_size_bytes)]]
        .map(([l, v]) => `<article class="metric-card"><span class="metric-label">${l}</span><strong>${esc(String(v))}</strong></article>`).join("");
    $("summaryText").textContent = doc.summary || "No summary was returned.";
    $("keywords").innerHTML = (doc.keywords || []).map((k) => `<span class="tag">${esc(k)}</span>`).join("");
    list("importantPoints", doc.important_points);
    list("securityNotes", doc.security_notes, "No security observations were identified.");
    list("suggestedQuestions", doc.suggested_questions);
    const meta = { sha256: doc.sha256, ...doc.metadata };
    $("metadataList").innerHTML = Object.entries(meta).filter(([, v]) => v)
        .map(([k, v]) => `<dt>${esc(fmtLabel(k))}</dt><dd>${esc(String(v))}</dd>`).join("");
    $("pagesList").innerHTML = (doc.pages || []).map((p) =>
        `<details><summary>Page ${p.page_number}</summary><pre>${esc(p.text || "No readable text on this page.")}</pre></details>`).join("");
}

$("suggestedQuestions").onclick = async (e) => {
    if (e.target.tagName !== "LI") return;
    await loadChatDocs(currentDocId);
    show("chat");
    $("chatDoc").value = currentDocId;
    ask(e.target.textContent);
};
$("downloadButton").onclick = async () => {
    const tab = window.open("", "_blank");   // opened synchronously, before the await, so browsers don't block it
    try {
        const { url } = await api(`/api/documents/${currentDocId}/download`);
        if (tab) tab.location = url; else window.location.href = url;
    } catch (error) {
        if (tab) tab.close();
        alert(`Could not download the file: ${error.message}`);
    }
};

// ---------- Chat (RAG) ----------
async function loadChatDocs(selected) {
    const docs = await api("/api/documents");
    $("chatDoc").innerHTML = `<option value="">All my documents</option>` +
        docs.map((d) => `<option value="${d.id}">${esc(d.original_filename)}</option>`).join("");
    if (selected) $("chatDoc").value = selected;
}

function addMessage(cls, html) {
    const div = document.createElement("div");
    div.className = `message ${cls}`;
    div.innerHTML = html;
    $("messages").appendChild(div);
    div.scrollIntoView({ behavior: "smooth", block: "end" });
    return div;
}

const sourceHtml = (sources) => sources.map((s, i) => `
    <details><summary>[${i + 1}] ${esc(s.filename)} · page ${s.page_number} · match ${Math.round(s.similarity * 100)}%</summary>
    <pre>${esc(s.content)}</pre></details>`).join("");

async function ask(question) {
    addMessage("user", esc(question));
    const pending = addMessage("bot", "Thinking...");
    try {
        const r = await api("/api/chat", { method: "POST", json: { question, document_id: $("chatDoc").value || null } });
        pending.innerHTML = `<p>${esc(r.answer)}</p><p class="muted-text">Confidence: ${r.confidence}%</p>${sourceHtml(r.sources)}`;
    } catch (error) {
        pending.textContent = `Error: ${error.message}`;
    }
}
$("chatForm").onsubmit = (e) => { e.preventDefault(); const q = $("chatInput").value; $("chatInput").value = ""; ask(q); };

// ---------- Search ----------
$("searchForm").onsubmit = async (e) => {
    e.preventDefault();
    $("searchResults").textContent = "Searching...";
    try {
        const rows = await api("/api/search", { method: "POST", json: { query: $("searchInput").value } });
        $("searchResults").innerHTML = rows.length ? sourceHtml(rows) : `<p class="muted-text">No matches found.</p>`;
    } catch (error) {
        $("searchResults").textContent = `Error: ${error.message}`;
    }
};

// ---------- Statistics ----------
async function loadStats() {
    const s = await api("/api/stats");
    const types = Object.entries(s.by_type).map(([t, n]) => `${t} ${n}`).join(" · ") || "-";
    $("statsGrid").innerHTML = [["Documents", s.documents], ["Pages", s.pages],
        ["Storage used", fmtSize(s.storage_bytes)], ["Searchable chunks", s.searchable_chunks], ["File types", types]]
        .map(([l, v]) => `<article class="metric-card"><span class="metric-label">${l}</span><strong>${esc(String(v))}</strong></article>`).join("");
}

start();