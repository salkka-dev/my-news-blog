// 데일리인사이트(dailyinsight-news.kr) 정적 사이트 빌드.
// ../content/*.md 원고를 읽어 저장소 루트에 HTML을 만든다. Cloudflare Pages는 저장소 루트를 그대로 배포한다.
//   cd _src && npm install && node build.mjs
import { readFile, writeFile, mkdir, readdir, rm, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { Marked } from "marked";

const SRC = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SRC, "..");
const OUT = ROOT;
const CONTENT = join(ROOT, "content");
const GENERATED = ["index.html", "404.html", "article", "category", "glossary.html", "about.html", "contact.html", "privacy.html", "terms.html", "editorial-policy.html", "sitemap.xml", "robots.txt", "feed.xml", "ads.txt", "assets", "og-image.png", "favicon.ico", "favicon-32.png", "apple-touch-icon.png", "icon-512.png", "_headers", "_redirects"];

const SITE = {
  name: "데일리인사이트",
  en: "Daily Insight",
  url: "https://dailyinsight-news.kr",
  email: "contact@calcitda.com",
  operator: "데일리인사이트 편집팀",
  adClient: "ca-pub-8975980143082765",
  gsc: "lw1KRUSHXzh6LrkaSsOtSr8IbpkDrBZ-1-NPm47n9Vw",
  description: "기준금리, CPI, 환율, DSR, PER처럼 경제 뉴스에 자주 나오는 용어와 지표를 숫자 예시와 함께 풀어 쓰는 해설 사이트입니다.",
};

const CATEGORIES = {
  rates: { name: "금리·통화", intro: "기준금리, FOMC, 국채 금리, 양적완화처럼 돈의 값과 양을 정하는 제도와 지표를 다룹니다." },
  prices: { name: "물가·경기", intro: "소비자물가지수, 근원물가, GDP 성장률, 경기침체처럼 물가와 경기 흐름을 읽는 지표를 다룹니다." },
  fx: { name: "환율·무역", intro: "환율이 오르고 내릴 때 생기는 일, 달러인덱스, 엔캐리 트레이드, 경상수지를 다룹니다." },
  stocks: { name: "주식·투자", intro: "코스피와 코스닥, PER과 PBR, 배당락, 공매도, ETF처럼 투자 뉴스에 나오는 용어를 다룹니다." },
  household: { name: "대출·예금·제도", intro: "DSR, LTV, 전세가율, 예금자보호, ISA처럼 가계의 대출과 저축에 바로 닿는 제도를 다룹니다." },
};
const CAT_ORDER = ["rates", "prices", "fx", "stocks", "household"];

const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const isoDate = (d) => String(d instanceof Date ? d.toISOString() : d).slice(0, 10);
const fmtDate = (d) => { const [y, m, day] = isoDate(d).split("-").map(Number); return `${y}년 ${m}월 ${day}일`; };

function render(md) {
  const headings = [];
  let n = 0;
  const m = new Marked({ gfm: true });
  m.use({
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        if (depth === 2) {
          n += 1;
          headings.push({ id: `s${n}`, text: text.replace(/<[^>]+>/g, "") });
          return `<h2 id="s${n}">${text}</h2>\n`;
        }
        return `<h${depth}>${text}</h${depth}>\n`;
      },
      table(token) {
        const head = token.header.map((c) => `<th>${this.parser.parseInline(c.tokens)}</th>`).join("");
        const rows = token.rows.map((r) => `<tr>${r.map((c) => `<td>${this.parser.parseInline(c.tokens)}</td>`).join("")}</tr>`).join("\n");
        return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>\n`;
      },
      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        const ext = /^https?:\/\//.test(href) && !href.startsWith(SITE.url);
        return `<a href="${esc(href)}"${title ? ` title="${esc(title)}"` : ""}${ext ? ' target="_blank" rel="noopener"' : ""}>${text}</a>`;
      },
    },
  });
  return { html: m.parse(md), headings };
}
const textLen = (md) => md.replace(/\|/g, " ").replace(/[#>*_`\-]/g, "").replace(/\s+/g, " ").trim().length;

async function loadPosts() {
  if (!existsSync(CONTENT)) return [];
  const files = (await readdir(CONTENT)).filter((f) => f.endsWith(".md"));
  const posts = [];
  for (const f of files) {
    const { data, content } = matter(await readFile(join(CONTENT, f), "utf8"));
    const slug = data.slug || f.replace(/\.md$/, "");
    const { html, headings } = render(content);
    posts.push({ ...data, slug, updated: isoDate(data.updated || "2026-11-19"), html, headings, chars: textLen(content), url: `/article/${slug}` });
  }
  return posts;
}

const crumbLd = (items) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map(([h, t], i) => ({ "@type": "ListItem", position: i + 1, name: t, item: SITE.url + (h === "/" ? "/" : h) })),
});
const crumbs = (items) => `<nav class="crumbs" aria-label="현재 위치">${items.map(([h, t], i) => (i === items.length - 1 ? `<span>${esc(t)}</span>` : `<a href="${h}">${esc(t)}</a>`)).join('<span class="sep">/</span>')}</nav>`;

function layout({ title, description, path, body, jsonld = [], type = "website", noindex = false }) {
  const canonical = SITE.url + (path === "/" ? "/" : path);
  const fullTitle = path === "/" ? `${SITE.name} | 경제 뉴스 용어 해설` : `${title} | ${SITE.name}`;
  const nav = CAT_ORDER.map((k) => `<a href="/category/${k}"${path === `/category/${k}` ? ' aria-current="page"' : ""}>${CATEGORIES[k].name}</a>`).join("") + `<a href="/glossary"${path === "/glossary" ? ' aria-current="page"' : ""}>용어 찾기</a>`;
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
${noindex ? '<meta name="robots" content="noindex">' : '<meta name="robots" content="index, follow, max-image-preview:large">'}
<meta name="google-site-verification" content="${SITE.gsc}">
<meta name="google-adsense-account" content="${SITE.adClient}">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="${SITE.name}">
<meta property="og:locale" content="ko_KR">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SITE.url}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/favicon-32.png" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="alternate" type="application/rss+xml" title="${SITE.name}" href="/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@600;700&display=swap">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<link rel="stylesheet" href="/assets/site.css?v=20261119">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${SITE.adClient}" crossorigin="anonymous"></script>
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join("\n")}
</head>
<body>
<header class="masthead">
  <div class="wrap mast-top">
    <a class="brand" href="/"><span class="brand-ko">데일리인사이트</span><span class="brand-en">DAILY INSIGHT</span></a>
    <p class="mast-tag">경제 뉴스 용어 해설</p>
  </div>
  <nav class="catnav" aria-label="분야"><div class="wrap catnav-inner">${nav}</div></nav>
</header>
<main id="main">
${body}
</main>
<footer class="site-footer">
  <div class="wrap foot">
    <div>
      <p class="foot-brand">데일리인사이트</p>
      <p>경제 뉴스에 나오는 용어와 지표를 풀어 씁니다. 글에 적은 수치는 기준일 시점의 공식 통계와 발표를 따르며, 투자나 대출을 권유하지 않습니다.</p>
    </div>
    <nav aria-label="사이트 정보"><a href="/about">소개</a><a href="/editorial-policy">편집 원칙</a><a href="/contact">문의</a><a href="/privacy">개인정보처리방침</a><a href="/terms">이용약관</a></nav>
  </div>
  <div class="wrap copy">© 2026 ${SITE.en} · dailyinsight-news.kr</div>
</footer>
</body>
</html>
`;
}

const card = (p, big = false) => `<a class="story${big ? " story-lead" : ""}" href="${p.url}">
  <span class="kicker">${esc(CATEGORIES[p.category]?.name || "")}</span>
  <strong>${esc(p.title)}</strong>
  <span class="dek">${esc(p.description)}</span>
</a>`;

function articlePage(p, all) {
  const cat = CATEGORIES[p.category];
  const items = [["/", "홈"], [`/category/${p.category}`, cat.name], [p.url, p.title]];
  const faq = Array.isArray(p.faq) ? p.faq : [];
  const sources = Array.isArray(p.sources) ? p.sources : [];
  let related = (Array.isArray(p.related) ? p.related : []).map((s) => all.find((x) => x.slug === s)).filter(Boolean);
  if (related.length < 4) related = related.concat(all.filter((x) => x.category === p.category && x.slug !== p.slug && !related.includes(x)));
  related = related.slice(0, 4);
  const minutes = Math.max(3, Math.round(p.chars / 600));
  const ld = [
    crumbLd(items),
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: p.title,
      description: p.description,
      datePublished: p.published || p.updated,
      dateModified: p.updated,
      inLanguage: "ko-KR",
      mainEntityOfPage: SITE.url + p.url,
      author: { "@type": "Organization", name: SITE.operator, url: SITE.url + "/about" },
      publisher: { "@type": "Organization", name: SITE.name, url: SITE.url, logo: { "@type": "ImageObject", url: SITE.url + "/icon-512.png" } },
      image: SITE.url + "/og-image.png",
    },
  ];
  if (p.keyword) ld.push({ "@context": "https://schema.org", "@type": "DefinedTerm", name: p.keyword, description: p.summary || p.description, url: SITE.url + p.url, inDefinedTermSet: SITE.url + "/glossary" });
  if (faq.length) ld.push({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) });
  const toc = p.headings.length >= 3 ? `<nav class="toc" aria-label="목차"><p>이 글의 순서</p><ol>${p.headings.map((h) => `<li><a href="#${h.id}">${esc(h.text)}</a></li>`).join("")}</ol></nav>` : "";
  const body = `<div class="wrap read">
${crumbs(items)}
<article class="article">
  <header class="art-head">
    <a class="kicker" href="/category/${p.category}">${esc(cat.name)}</a>
    <h1>${esc(p.title)}</h1>
    <p class="dek">${esc(p.description)}</p>
    <p class="byline"><span>${SITE.operator}</span><time datetime="${p.updated}">${fmtDate(p.updated)} 업데이트</time><span>읽는 시간 약 ${minutes}분</span></p>
  </header>
  ${p.summary ? `<aside class="brief"><p class="brief-t">핵심 요약</p><p>${esc(p.summary)}</p></aside>` : ""}
  ${toc}
  <div class="prose">${p.html}</div>
  ${faq.length ? `<section class="faq"><h2>자주 묻는 질문</h2>${faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}</section>` : ""}
  ${sources.length ? `<section class="sources"><h2>참고한 자료</h2><ul>${sources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a></li>`).join("")}</ul><p>${fmtDate(p.updated)} 기준으로 위 자료와 대조했습니다. 수치는 발표 기관의 수정이나 새 발표에 따라 달라질 수 있습니다. 오류 제보는 <a href="/contact">문의</a>로 받습니다.</p></section>` : ""}
  <p class="disclaimer">이 글은 경제 용어와 제도를 설명하는 일반 정보이며 특정 금융상품의 매수, 매도, 가입을 권유하지 않습니다.</p>
</article>
${related.length ? `<section class="more"><h2>이어서 읽기</h2><div class="story-grid">${related.map((r) => card(r)).join("")}</div></section>` : ""}
</div>`;
  return layout({ title: p.title, description: p.description, path: p.url, body, jsonld: ld, type: "article" });
}

function categoryPage(key, posts) {
  const cat = CATEGORIES[key];
  const list = posts.filter((p) => p.category === key);
  const items = [["/", "홈"], [`/category/${key}`, cat.name]];
  const body = `<div class="wrap">
${crumbs(items)}
<section class="sec-head-big"><h1>${esc(cat.name)}</h1><p>${esc(cat.intro)}</p></section>
<div class="story-grid">${list.map((p) => card(p)).join("")}</div>
</div>`;
  return layout({ title: `${cat.name} 용어 해설`, description: `${cat.intro} 데일리인사이트 ${cat.name} 해설 ${list.length}편.`, path: `/category/${key}`, body, jsonld: [crumbLd(items)] });
}

function glossaryPage(posts) {
  const items = [["/", "홈"], ["/glossary", "용어 찾기"]];
  const sorted = [...posts].sort((a, b) => (a.keyword || a.title).localeCompare(b.keyword || b.title, "ko"));
  const rows = sorted.map((p) => `<li><a href="${p.url}"><strong>${esc((p.keyword || p.title).replace(/ 뜻$/, ""))}</strong><span>${esc(p.summary || p.description)}</span></a></li>`).join("");
  const body = `<div class="wrap">
${crumbs(items)}
<section class="sec-head-big"><h1>용어 찾기</h1><p>데일리인사이트가 풀어 쓴 경제 용어 ${posts.length}개를 가나다순으로 모았습니다. 용어를 누르면 계산 예시와 뉴스 문장 해석이 담긴 해설로 이동합니다.</p></section>
<ul class="gloss">${rows}</ul>
</div>`;
  const ld = [crumbLd(items), { "@context": "https://schema.org", "@type": "DefinedTermSet", name: "데일리인사이트 경제 용어", url: SITE.url + "/glossary", hasDefinedTerm: sorted.map((p) => ({ "@type": "DefinedTerm", name: (p.keyword || p.title).replace(/ 뜻$/, ""), url: SITE.url + p.url })) }];
  return layout({ title: "경제 용어 찾기", description: `기준금리부터 ETF까지 데일리인사이트가 해설한 경제 용어 ${posts.length}개를 가나다순으로 정리했습니다.`, path: "/glossary", body, jsonld: ld });
}

function homePage(posts) {
  const lead = posts.find((p) => p.slug === "base-rate") || posts[0];
  const second = ["cpi", "exchange-rate-rise-effects", "dsr", "per-pbr"].map((s) => posts.find((p) => p.slug === s)).filter(Boolean);
  const sections = CAT_ORDER.map((k) => {
    const list = posts.filter((p) => p.category === k);
    if (!list.length) return "";
    return `<section class="cat-sec">
  <div class="cat-sec-head"><h2><a href="/category/${k}">${CATEGORIES[k].name}</a></h2><p>${esc(CATEGORIES[k].intro)}</p></div>
  <ul class="cat-list">${list.map((p) => `<li><a href="${p.url}"><strong>${esc(p.title)}</strong><span>${esc(p.description)}</span></a></li>`).join("")}</ul>
</section>`;
  }).join("\n");
  const body = `<div class="wrap">
<section class="front">
  ${lead ? card(lead, true) : ""}
  <div class="front-side">${second.map((p) => card(p)).join("")}</div>
</section>
<section class="intro-band">
  <h1>경제 뉴스에 나온 용어, 숫자 예시로 풀어 드립니다</h1>
  <p>금리, 물가, 환율, 주식, 대출 기사에 반복해서 나오는 용어 ${posts.length}개를 해설했습니다. 글마다 뜻과 계산 방식, 실제 뉴스 문장을 읽는 법, 가계에 닿는 영향을 차례로 설명하고 한국은행, 통계청, 금융위원회 같은 발표 기관의 자료를 출처로 붙였습니다.</p>
  <a class="btn" href="/glossary">용어 전체 보기</a>
</section>
${sections}
</div>`;
  const ld = [
    { "@context": "https://schema.org", "@type": "WebSite", name: SITE.name, alternateName: SITE.en, url: SITE.url + "/", inLanguage: "ko-KR", description: SITE.description },
    { "@context": "https://schema.org", "@type": "Organization", name: SITE.name, url: SITE.url + "/", logo: SITE.url + "/icon-512.png", email: SITE.email },
  ];
  return layout({ title: SITE.name, description: SITE.description, path: "/", body, jsonld: ld });
}

async function staticPages() {
  const dir = join(SRC, "pages");
  const out = [];
  for (const f of (await readdir(dir)).filter((x) => x.endsWith(".md"))) {
    const { data, content } = matter(await readFile(join(dir, f), "utf8"));
    const slug = f.replace(/\.md$/, "");
    const { html } = render(content.replaceAll("{{EMAIL}}", SITE.email).replaceAll("{{OPERATOR}}", SITE.operator));
    const path = `/${slug}`;
    const items = [["/", "홈"], [path, data.title]];
    const body = `<div class="wrap read">${crumbs(items)}<article class="article page"><header class="art-head"><h1>${esc(data.title)}</h1>${data.updated ? `<p class="byline"><span>${fmtDate(data.updated)} 개정</span></p>` : ""}</header><div class="prose">${html}</div></article></div>`;
    out.push({ slug, path, updated: isoDate(data.updated || "2026-11-19"), html: layout({ title: data.title, description: data.description, path, body, jsonld: [crumbLd(items)] }) });
  }
  return out;
}

async function write(rel, html) {
  const file = join(OUT, rel);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, html, "utf8");
}

async function main() {
  const posts = await loadPosts();
  for (const p of posts) if (!CATEGORIES[p.category]) throw new Error(`알 수 없는 카테고리 ${p.category} (${p.slug})`);
  posts.sort((a, b) => CAT_ORDER.indexOf(a.category) - CAT_ORDER.indexOf(b.category) || (a.order ?? 99) - (b.order ?? 99));

  for (const g of GENERATED) await rm(join(OUT, g), { recursive: true, force: true });
  await cp(join(SRC, "static"), OUT, { recursive: true });

  for (const p of posts) await write(`article/${p.slug}.html`, articlePage(p, posts));
  for (const k of CAT_ORDER) await write(`category/${k}.html`, categoryPage(k, posts));
  await write("glossary.html", glossaryPage(posts));
  await write("index.html", homePage(posts));
  const pages = await staticPages();
  for (const pg of pages) await write(`${pg.slug}.html`, pg.html);
  await write("404.html", layout({ title: "페이지를 찾을 수 없습니다", description: "요청한 페이지가 없습니다.", path: "/404", noindex: true, body: `<div class="wrap"><section class="sec-head-big"><h1>페이지를 찾을 수 없습니다</h1><p>예전 뉴스 요약 글은 2026년 11월 사이트 개편 때 모두 내렸습니다. 아래 분야에서 경제 용어 해설을 찾아보세요.</p></section><div class="story-grid">${CAT_ORDER.map((k) => `<a class="story" href="/category/${k}"><span class="kicker">분야</span><strong>${CATEGORIES[k].name}</strong><span class="dek">${esc(CATEGORIES[k].intro)}</span></a>`).join("")}</div></div>` }));

  const today = "2026-11-19";
  const urls = [
    { loc: "/", lastmod: today },
    { loc: "/glossary", lastmod: today },
    ...CAT_ORDER.map((k) => ({ loc: `/category/${k}`, lastmod: today })),
    ...posts.map((p) => ({ loc: p.url, lastmod: p.updated })),
    ...pages.map((p) => ({ loc: p.path, lastmod: p.updated })),
  ];
  await write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${SITE.url}${u.loc}</loc><lastmod>${u.lastmod}</lastmod></url>`).join("\n")}\n</urlset>\n`);
  await write("robots.txt", `User-agent: *\nAllow: /\nDisallow: /_src/\nDisallow: /content/\n\nSitemap: ${SITE.url}/sitemap.xml\n`);
  await write("feed.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${SITE.name}</title><link>${SITE.url}/</link><description>${esc(SITE.description)}</description><language>ko</language>\n${posts.slice(0, 40).map((p) => `<item><title>${esc(p.title)}</title><link>${SITE.url}${p.url}</link><guid>${SITE.url}${p.url}</guid><description>${esc(p.description)}</description><pubDate>${new Date(p.updated + "T09:00:00+09:00").toUTCString()}</pubDate></item>`).join("\n")}\n</channel></rss>\n`);
  const short = posts.filter((p) => p.chars < 2200);
  console.log(`[build] 해설 ${posts.length}편, 고정 페이지 ${pages.length}, sitemap ${urls.length}개`);
  if (short.length) console.log(`[build] 분량 부족 의심: ${short.map((p) => `${p.slug}(${p.chars})`).join(", ")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
