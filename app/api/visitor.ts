import { NextRequest } from 'next/server';

const VISITOR_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function readVisitorId(request: NextRequest) {
  const visitorId = request.headers.get('x-visitor-id')?.trim() ?? '';
  return VISITOR_ID_PATTERN.test(visitorId) ? visitorId : null;
}

export function missingVisitorResponse() {
  return Response.json({ error: 'Faça seu cadastro para acessar este espaço.' }, { status: 401 });
}
