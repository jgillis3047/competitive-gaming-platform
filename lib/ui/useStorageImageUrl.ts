// lib/ui/useStorageImageUrl.ts - Hook to fetch signed URLs for avatars/media
import { useEffect, useState } from "react";
import { getAvatarDisplayUrl, getMediaDisplayUrl } from "../backend/imageUrls";

export function useAvatarUrl(pathOrUrl: string | null | undefined): string {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!pathOrUrl?.trim()) {
      setUrl("");
      return;
    }
    let cancelled = false;
    getAvatarDisplayUrl(pathOrUrl).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => { cancelled = true; };
  }, [pathOrUrl]);
  return url;
}

export function useMediaUrl(pathOrUrl: string | null | undefined): string {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!pathOrUrl?.trim()) {
      setUrl("");
      return;
    }
    let cancelled = false;
    getMediaDisplayUrl(pathOrUrl).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => { cancelled = true; };
  }, [pathOrUrl]);
  return url;
}
