import { readFile } from 'node:fs/promises'

export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])

let logoFiles
function loadLogos() {
  logoFiles ||= Promise.all([
    readFile(new URL('./mail-assets/el-calvario.png', import.meta.url)),
    readFile(new URL('./mail-assets/nexus.png', import.meta.url)),
  ]).catch(error => { logoFiles = null; throw error })
  return logoFiles
}

export const mailButton = (label, url) => `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;padding:15px 22px;border-radius:10px;background:#ef5726;color:#171717;text-decoration:none;font-weight:bold">${escapeHtml(label)}</a></p>`

export async function brandedEmail({ email, subject, title, body, text }, configuration) {
  const [church, nexus] = await loadLogos()
  return {
    from: `El Calvario - Nexus Soporte <${configuration.from}>`,
    to: [email], subject, text,
    html: `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f6f4f0;color:#272720;font-family:Arial,sans-serif">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f4f0"><tr><td align="center" style="padding:24px 12px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e7e3dd;border-radius:16px">
        <tr><td style="padding:8px 20px 0;background:#ffffff;border-radius:16px 16px 0 0">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
            <td width="55%" align="left" valign="middle"><img src="cid:el-calvario@correo.local" alt="Misión Cristiana El Calvario Villavicencio" width="250" style="display:block;width:100%;max-width:250px;height:auto;border:0"></td>
            <td width="45%" align="right" valign="middle"><img src="cid:nexus@correo.local" alt="Nexus Corporation · Soporte" width="200" style="display:block;width:100%;max-width:200px;height:auto;border:0"></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:0 24px 28px;font-size:15px;line-height:1.65;overflow-wrap:anywhere">
          <p style="margin:0 0 8px;font-size:11px;letter-spacing:1px;color:#9b4a2f;font-weight:bold">EL CALVARIO · NEXUS SOPORTE</p>
          <h1 style="margin:0 0 20px;font-size:26px;line-height:1.2;color:#272720">${escapeHtml(title)}</h1>
          ${body}
          <p style="margin:28px 0 0;padding-top:18px;border-top:1px solid #e7e3dd;font-size:12px;color:#737b85">Misión Cristiana El Calvario · Villavicencio<br>Nexus Corporation · Soporte de la plataforma</p>
        </td></tr>
      </table></td></tr></table></body></html>`,
    attachments: [
      { filename: 'el-calvario.png', content: church, contentType: 'image/png', cid: 'el-calvario@correo.local', contentDisposition: 'inline' },
      { filename: 'nexus.png', content: nexus, contentType: 'image/png', cid: 'nexus@correo.local', contentDisposition: 'inline' },
    ],
  }
}
