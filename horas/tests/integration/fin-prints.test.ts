import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { imagesToPdf } from '@/server/financeiro/images-pdf';
import { createFinPeriod, getFinDocumentFile, getFinPeriod, processFinDocument, uploadFinDocument } from '@/server/services/fin-service';
import { META, ensureCatalog, hasDb, makeUser } from './helpers';

// PNG 1×1 (branco) e JPG mínimo válidos.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');

describe('Prints de tela → um documento', () => {
  it('junta vários prints num PDF (uma página por print) e recusa o que não é imagem', async () => {
    const pdf = await imagesToPdf([new File([PNG], 'a.png'), new File([PNG], 'b.png'), new File([PNG], 'c.png')]);
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(3);
    await expect(imagesToPdf([new File(['texto'], 'x.png')])).rejects.toThrow(/não é PNG nem JPG/);
  });
});

describe.skipIf(!hasDb)('Prints na competência', () => {
  const prev = process.env.AI_FAKE;
  const month = `${2100 + Math.floor(Math.random() * 800)}-03`;
  beforeAll(() => { process.env.AI_FAKE = '1'; });
  afterAll(() => { process.env.AI_FAKE = prev; });

  it('PDF de prints entra como documento comum e é processado', async () => {
    await ensureCatalog();
    const admin = await makeUser('ADMIN');
    await createFinPeriod(admin.principal, month, META);
    const pdf = await imagesToPdf([new File([PNG], 'p1.png'), new File([PNG], 'p2.png')]);
    const id = await uploadFinDocument(admin.principal, month, 'PDV', new File([new Uint8Array(pdf)], 'Prints PDV Lanchonete (2).pdf', { type: 'application/pdf' }), null, META);
    expect((await processFinDocument(admin.principal, id, META)).lines).toBeGreaterThan(0);
    const p = await getFinPeriod(admin.principal, month);
    expect(p.documents[0]!.filename).toBe('Prints PDV Lanchonete (2).pdf');
    expect((await getFinDocumentFile(admin.principal, id)).data.subarray(0, 4).toString()).toBe('%PDF');
  });
});
