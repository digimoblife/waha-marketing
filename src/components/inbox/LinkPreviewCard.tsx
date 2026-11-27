'use client';

import React, { useState, useEffect } from 'react';
import { Globe, ExternalLink } from 'lucide-react';

interface LinkPreviewData {
  url: string;
  hostname: string;
  title: string | null;
  description: string | null;
  image: string | null;
}

const clientPreviewCache = new Map<string, LinkPreviewData>();
const inflightRequests = new Map<string, Promise<LinkPreviewData | null>>();

function getHostnameFallback(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Tautan';
  }
}

export default function LinkPreviewCard({
  url,
  fromMe,
}: {
  url: string;
  fromMe: boolean;
}) {
  const [data, setData] = useState<LinkPreviewData | null>(
    () => clientPreviewCache.get(url) || null
  );
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
    const cached = clientPreviewCache.get(url);
    if (cached) {
      setData(cached);
      return;
    }

    let cancelled = false;
    let req = inflightRequests.get(url);
    if (!req) {
      req = fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          const preview = json?.preview || null;
          if (preview) clientPreviewCache.set(url, preview);
          return preview;
        })
        .catch(() => null)
        .finally(() => {
          inflightRequests.delete(url);
        });
      inflightRequests.set(url, req);
    }

    req.then((preview) => {
      if (!cancelled && preview) {
        setData(preview);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [url]);

  const hostname = data?.hostname || getHostnameFallback(url);
  const title = data?.title || hostname;
  const description = data?.description;
  const showImage = Boolean(data?.image && !imgError);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`mt-2 block rounded-lg overflow-hidden border transition no-underline text-left ${
        fromMe
          ? 'bg-white/10 hover:bg-white/15 border-white/15 text-white'
          : 'bg-[#F4F8FA] hover:bg-[#ECF6FA] border-[#D1DEE5] text-[#0F232E]'
      }`}
    >
      {showImage && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={data!.image!}
          alt={title}
          loading="lazy"
          onError={() => setImgError(true)}
          className="w-full max-h-[140px] object-cover border-b border-black/10 block"
        />
      )}

      <div className="p-2.5 flex items-start gap-2.5">
        {!showImage && (
          <div
            className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
              fromMe
                ? 'bg-white/15 text-[#BED630]'
                : 'bg-[#ECF6FA] text-[#00688E] border border-[#A7D6E7]'
            }`}
          >
            <Globe className="w-4 h-4" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div
            className={`text-[12px] font-semibold leading-snug line-clamp-2 ${
              fromMe ? 'text-white' : 'text-[#0F232E]'
            }`}
          >
            {title}
          </div>
          {description && (
            <p
              className={`text-[11px] leading-snug line-clamp-2 mt-0.5 ${
                fromMe ? 'text-white/75' : 'text-[#5C7685]'
              }`}
            >
              {description}
            </p>
          )}
          <div
            className={`text-[10.5px] mt-1 flex items-center gap-1 truncate ${
              fromMe ? 'text-[#BED630]' : 'text-[#00688E]'
            }`}
          >
            <span className="truncate font-mono">{hostname}</span>
            <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-80" />
          </div>
        </div>
      </div>
    </a>
  );
}
