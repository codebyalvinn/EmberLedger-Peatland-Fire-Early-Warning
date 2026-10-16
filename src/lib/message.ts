import type { WatchItem } from "@/lib/engine/watchlist";

const driverInIndonesian: Record<WatchItem["topDriver"], string> = {
  dry: "profil cuaca yang lebih kering",
  clear: "indikasi pembukaan lahan di sekitar area",
  hot: "titik panas satelit yang telah terdeteksi",
};

const driverInEnglish: Record<WatchItem["topDriver"], string> = {
  dry: "drier weather conditions",
  clear: "nearby land-clearing alerts",
  hot: "satellite hotspots already detected",
};

export function createAlertMessage(
  item: WatchItem,
  horizon: 0 | 3 | 7,
  lang: "id" | "en",
) {
  if (lang === "id") {
    const horizonText =
      horizon === 0 ? "saat ini" : `dalam beberapa hari ke depan`;
    return [
      `Yth. Tim Masyarakat Peduli Api ${item.village.name},`,
      `Indeks risiko relatif EmberLedger menunjukkan tingkat ${
        item.risk >= 65 ? "tinggi" : item.risk >= 35 ? "sedang" : "waspada"
      } ${horizonText}, dengan sinyal utama berupa ${driverInIndonesian[item.topDriver]}.`,
      "Mohon pertimbangkan patroli pada lahan gambut terdekat, periksa saluran air dan area pembukaan lahan, serta pastikan peralatan dan sumber air siap digunakan.",
      "Ini adalah informasi pendukung, bukan kepastian kebakaran. Data muka air tanah dan kualitas udara belum tersedia; hotspot hanya mencatat kebakaran yang telah terdeteksi.",
    ].join("\n\n");
  }

  const horizonText =
    horizon === 0 ? "at the current snapshot" : "over the coming days";
  return [
    `To the ${item.village.name} community fire-care team,`,
    `The EmberLedger relative risk index is ${
      item.risk >= 65 ? "high" : item.risk >= 35 ? "moderate" : "elevated"
    } ${horizonText}, with the leading signal being ${driverInEnglish[item.topDriver]}.`,
    "Consider patrolling nearby peat areas, checking canals and clearing activity, and preparing equipment and water supplies.",
    "This is decision support, not a fire prediction. Groundwater-table and air-quality measurements are unavailable; hotspots only record fires already detected.",
  ].join("\n\n");
}
