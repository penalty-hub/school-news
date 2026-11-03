(() => {
  const app = document.getElementById("app");
  const cache = { schools: null, config: null };

  const esc = (s = "") =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const fmtDate = (d) =>
    d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";

  async function api(params) {
    const res = await fetch("/api?" + new URLSearchParams(params));
    if (!res.ok) throw new Error(res.status === 404 ? "notfound" : "failed");
    return res.json();
  }

  const getSchools = async () => (cache.schools ??= await api({ resource: "schools" }));
  const getConfig = async () => (cache.config ??= await api({ resource: "config" }));

  function markdown(src = "") {
    return esc(src.trim())
      .split(/\n{2,}/)
      .map((block) => {
        const html = block
          .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
          .replace(/(^|[^*])\*(?!\*)(.+?)\*/g, "$1<em>$2</em>")
          .replace(/\n/g, "<br>");
        return `<p>${html}</p>`;
      })
      .join("");
  }

  const parseLinks = (text = "") =>
    text.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^https?:\/\//i.test(l));

  const loading = () => (app.innerHTML = `<div class="grid">${'<div class="skeleton"></div>'.repeat(6)}</div>`);
  const fail = (msg = "Something went wrong loading this page. Please try again.") =>
    (app.innerHTML = `<p class="error">${esc(msg)}</p><p class="empty"><a href="#/">← Back to schools</a></p>`);

  async function homeView() {
    loading();
    const schools = await getSchools();
    const categories = [...new Set(schools.map((s) => s.category).filter(Boolean))].sort();
    let activeCat = "";
    let query = "";

    app.innerHTML = `
      <section class="hero">
        <h1>Every campus. <em>One feed.</em></h1>
        <p>Find your school and see what's happening on campus.</p>
        <input class="search" type="search" id="q" placeholder="Search for your school…" aria-label="Search schools" autocomplete="off" />
      </section>
      ${categories.length ? `<div class="chips" id="chips">
        <button class="chip active" data-cat="">All</button>
        ${categories.map((c) => `<button class="chip" data-cat="${esc(c)}">${esc(c)}</button>`).join("")}
      </div>` : ""}
      <div class="grid" id="list"></div>`;

    const list = document.getElementById("list");
    const render = () => {
      const q = query.toLowerCase();
      const hits = schools.filter(
        (s) => (!activeCat || s.category === activeCat) &&
          (!q || s.name.toLowerCase().includes(q) || s.location.toLowerCase().includes(q))
      );
      list.innerHTML = hits.length
        ? hits.map((s) => `
          <a class="card school-card" href="#/school/${s.id}">
            <div class="card-media">${s.logo ? `<img src="${esc(s.logo)}" alt="" loading="lazy">` : `<span class="placeholder">${esc(s.name[0])}</span>`}</div>
            <div class="card-body">
              <h3>${esc(s.name)}</h3>
              <div class="meta">${s.location ? `<span>${esc(s.location)}</span>` : ""}${s.category ? `<span class="tag">${esc(s.category)}</span>` : ""}</div>
            </div>
          </a>`).join("")
        : `<p class="empty" style="grid-column:1/-1">No schools match your search.</p>`;
    };
    render();

    document.getElementById("q").addEventListener("input", (e) => { query = e.target.value.trim(); render(); });
    document.getElementById("chips")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      activeCat = btn.dataset.cat;
      document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === btn));
      render();
    });
  }

  async function schoolView(id) {
    loading();
    const [schools, stories] = await Promise.all([getSchools(), api({ resource: "stories", school: id })]);
    const school = schools.find((s) => s.id === id);
    if (!school) return fail("School not found.");

    app.innerHTML = `
      <a class="back" href="#/">← All schools</a>
      <h1 class="page-title">${esc(school.name)}</h1>
      <p class="sub">${esc(school.location)}</p>
      ${stories.length ? `<div class="grid">${stories.map((s) => `
        <a class="card" href="#/story/${s.id}">
          <div class="card-media">${s.thumbnail ? `<img src="${esc(s.thumbnail)}" alt="" loading="lazy">` : `<span class="placeholder">★</span>`}</div>
          <div class="card-body">
            <h3>${esc(s.title)}</h3>
            <div class="meta"><span>${fmtDate(s.date)}</span>${s.category ? `<span class="tag">${esc(s.category)}</span>` : ""}</div>
          </div>
        </a>`).join("")}</div>`
        : `<p class="empty">No stories yet for this school.<br><a href="#/submit">Be the first to submit one.</a></p>`}`;
  }

  async function storyView(id) {
    loading();
    const [story, schools] = await Promise.all([api({ resource: "story", id }), getSchools()]);
    const school = schools.find((s) => s.id === story.schoolId);
    const links = parseLinks(story.links);

    app.innerHTML = `
      <article class="article">
        <a class="back" href="#/${school ? "school/" + school.id : ""}">← ${school ? esc(school.name) : "All schools"}</a>
        <div class="meta"><span>${fmtDate(story.date)}</span>${story.category ? `<span class="tag">${esc(story.category)}</span>` : ""}</div>
        <h1>${esc(story.title)}</h1>
        ${story.thumbnail ? `<img class="article-img" src="${esc(story.thumbnail)}" alt="Image for: ${esc(story.title)}">` : ""}
        <div class="prose">${markdown(story.body)}</div>
        ${links.length ? `<section class="links-box"><h2>External Links</h2><ul>
          ${links.map((l) => `<li><a href="${esc(l)}" target="_blank" rel="noopener noreferrer">${esc(l)}</a></li>`).join("")}
        </ul></section>` : ""}
      </article>`;
  }

  async function submitView() {
    let email = "";
    try { email = (await getConfig()).submitEmail; } catch {}

    app.innerHTML = `
      <section class="submit">
        <h1 class="page-title">Submit <span>Tea</span></h1>
        <p class="sub">Got something your campus should know about? Here's exactly how it works.</p>

        <ol class="steps">
          <li><strong>Email it anonymously.</strong> Send your submission to the address below, ideally from a throwaway account created just for this.</li>
          <li><strong>Include everything we need:</strong>
            <ul style="margin:.5rem 0 0 1.2rem">
              <li>A <strong>safe-for-work thumbnail</strong> image</li>
              <li>A <strong>short summary</strong> of the details</li>
              <li>A <strong>fake name / pseudonym</strong> (see the note below)</li>
              <li>Your <strong>school name</strong></li>
              <li>A <strong>link to visual proof</strong> or a detailed explanation</li>
            </ul>
          </li>
          <li><strong>Wait for moderation.</strong> Every submission goes through a mandatory <strong>24-hour admin moderation queue</strong> before approval.</li>
        </ol>

        <div class="callout warn">
          <h2>🔒 Change your pseudonym every time</h2>
          <p>Never reuse a fake name. Reusing one makes it easier for people to link your submissions together, track you socially, or retaliate. Also avoid sending from school Wi-Fi or school-issued accounts.</p>
        </div>

        <div class="email-box">
          ${email
            ? `<code>${esc(email)}</code>
               <a class="btn" href="mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent("Submission")}&body=${encodeURIComponent("School name:\nPseudonym (new one each time):\nShort summary:\nLink to visual proof / detailed explanation:\n\n(Attach your safe-for-work thumbnail image)")}">Open email template</a>`
            : `<p class="empty">Submission email not configured yet.</p>`}
        </div>

        <div class="callout">
          <h2>Editorial Policy</h2>
          <p>“To protect and uplift our communities, submissions that negatively impact a school's image will be contextually framed to highlight institutional accountability, safety measures, and campus resolution. True gossip is a myth; transparency and swift resolution are our reality.”</p>
        </div>

        <div class="callout">
          <h2>What we won't publish</h2>
          <p>Sexual or explicit content, images of identifiable students, private personal details (addresses, phone numbers, social handles), and unverified accusations against named individuals.</p>
        </div>
      </section>`;
  }

  async function route() {
    const [, view, id] = (location.hash.slice(1) || "/").split("/");
    window.scrollTo(0, 0);
    try {
      if (!view) await homeView();
      else if (view === "school" && id) await schoolView(id);
      else if (view === "story" && id) await storyView(id);
      else if (view === "submit") await submitView();
      else fail("Page not found.");
    } catch (e) {
      fail(e.message === "notfound" ? "That story isn't available." : undefined);
    }
  }

  window.addEventListener("hashchange", route);
  route();
})();
