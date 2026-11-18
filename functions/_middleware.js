// 2026-11 개편: 예전 뉴스 요약 글(/posts/*)은 모두 내렸다. 검색엔진이 빨리 지우도록 410을 준다.
// 원고 폴더(/content, /_src, /functions)는 공개하지 않는다.
export async function onRequest(context) {
  const { pathname } = new URL(context.request.url);
  if (pathname.startsWith("/posts/") || pathname === "/posts") {
    return new Response(
      '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width, initial-scale=1"><title>삭제된 글 | 데일리인사이트</title></head><body style="font-family:sans-serif;max-width:640px;margin:60px auto;padding:0 16px;line-height:1.7"><h1>삭제된 글입니다</h1><p>예전 뉴스 요약 글은 2026년 11월 사이트 개편 때 모두 내렸습니다.</p><p><a href="/">데일리인사이트 경제 용어 해설로 가기</a></p></body></html>',
      { status: 410, headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex" } }
    );
  }
  if (/^\/(content|_src|functions)(\/|$)/.test(pathname)) {
    return new Response("Not found", { status: 404 });
  }
  return context.next();
}
