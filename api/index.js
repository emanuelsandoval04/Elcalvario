// An unknown API root must not fall through to the React page.
export default function handler(_request, response) {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.statusCode = 404
  response.end(JSON.stringify({ error: 'Recurso no encontrado.' }))
}
