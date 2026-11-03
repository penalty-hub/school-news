// Secure Airtable proxy. Token lives ONLY in Netlify environment variables.
const AIRTABLE = "https://api.airtable.com/v0";
const REC_ID = /^rec[A-Za-z0-9]{14}$/;

const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID, SUBMIT_EMAIL } = process.env;

async function airtable(path, params = []) {
  const url = new URL(`${AIRTABLE}/${AIRTABLE_BASE_ID}/${path}`);
  params.forEach(([k, v]) => url.searchParams.append(k, v));
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Airtable ${res.status}`);
  return res.json();
}

async function listAll(table, params = []) {
  let records = [];
  let offset;
  do {
    const p = offset ? [...params, ["offset", offset]] : params;
    const data = await airtable(encodeURIComponent(table), p);
    records = records.concat(data.records);
    offset = data.offset;
  } while (offset);
  return records;
}

const img = (att, big = false) => {
  const a = Array.isArray(att) && att[0];
  if (!a) return null;
  return big ? a.url : a.thumbnails?.large?.url || a.url;
};

const mapSchool = (r) => ({
  id: r.id,
  name: r.fields.School_Name || "Untitled school",
  location: r.fields.Location || "",
  category: r.fields.Category || "",
  logo: img(r.fields.School_Logo),
});

const mapStory = (r, full = false) => ({
  id: r.id,
  title: r.fields.Title || "Untitled",
  date: r.fields.Date_Published || null,
  category: r.fields.Category || "",
  schoolId: (r.fields.Target_School_ID || [])[0] || null,
  thumbnail: img(r.fields.SFW_Thumbnail, full),
  ...(full && {
    body: r.fields.Story_Body || "",
    links: r.fields.External_Links || "",
  }),
});

const json = (status, body, cache = 60) => ({
  statusCode: status,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": `public, max-age=0, s-maxage=${cache}`,
  },
  body: JSON.stringify(body),
});

// Hard-coded server-side filter: drafts can never be returned.
const APPROVED = ["filterByFormula", "{Status}='Approved'"];

exports.handler = async (event) => {
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    return json(500, { error: "Server not configured" }, 0);
  }
  const q = event.queryStringParameters || {};

  try {
    switch (q.resource) {
      case "config":
        return json(200, { submitEmail: SUBMIT_EMAIL || "" }, 300);

      case "schools": {
        const recs = await listAll("Schools", [
          ["sort[0][field]", "School_Name"],
          ["sort[0][direction]", "asc"],
        ]);
        return json(200, recs.map(mapSchool));
      }

      case "stories": {
        if (!REC_ID.test(q.school || "")) return json(400, { error: "Bad school id" }, 0);
        const recs = await listAll("Stories", [
          APPROVED,
          ["sort[0][field]", "Date_Published"],
          ["sort[0][direction]", "desc"],
        ]);
        const stories = recs
          .filter((r) => (r.fields.Target_School_ID || []).includes(q.school))
          .map((r) => mapStory(r));
        return json(200, stories);
      }

      case "story": {
        if (!REC_ID.test(q.id || "")) return json(400, { error: "Bad story id" }, 0);
        let rec;
        try {
          rec = await airtable(`Stories/${q.id}`);
        } catch {
          return json(404, { error: "Not found" }, 0);
        }
        if (rec.fields.Status !== "Approved") return json(404, { error: "Not found" }, 0);
        return json(200, mapStory(rec, true));
      }

      default:
        return json(400, { error: "Unknown resource" }, 0);
    }
  } catch (err) {
    console.error(err);
    return json(502, { error: "Upstream error" }, 0);
  }
};
