'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/**
 * QR Code para banners e telas do evento (§30).
 * Gerado no navegador — nada sai da máquina e o download é um PNG de alta
 * resolução, pronto para impressão.
 */
export function QrPanel({ target }: { target: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    void QRCode.toCanvas(canvas, target, {
      width: 1024,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: {
        // Navy oficial sobre branco: máximo contraste para leitura a distância.
        dark: '#022B57FF',
        light: '#FFFFFFFF',
      },
    }).then(() => setPronto(true));
  }, [target]);

  const baixar = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'nacao-athx-leaderboard-qrcode.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="rounded-2xl bg-white p-4">
        <canvas
          ref={canvasRef}
          className="h-56 w-56 sm:h-72 sm:w-72"
          aria-label={`QR Code que aponta para ${target}`}
          role="img"
        />
      </div>

      <p className="tnum rounded-lg border border-white/12 bg-white/[0.05] px-3 py-1.5 text-center text-xs break-all text-white/70">
        {target}
      </p>

      <Button type="button" onClick={baixar} disabled={!pronto} variant="cyan" size="lg">
        <Download size={16} aria-hidden="true" />
        Baixar QR Code
      </Button>
    </div>
  );
}
