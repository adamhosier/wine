export type LeafGrapeProfile = {
  grapes: string[];
  sources: string[];
};

const FR_SOURCES = [
  "https://www.bourgogne-wines.com/",
  "https://www.vins-rhone.com/en",
  "https://www.vins-bordeaux.fr/",
  "https://www.champagne.fr/en",
  "https://www.loirevalley-wines.com/",
];

const IT_SOURCES = [
  "https://www.italianwinecentral.com/",
  "https://www.winescholarguild.com/resource/italy/",
];

const ES_PT_SOURCES = [
  "https://www.winesfromspain.com/",
  "https://www.winesofportugal.com/en/",
];

const DE_SOURCES = [
  "https://www.germanwines.de/",
];

const US_SOURCES = [
  "https://www.wineinstitute.org/",
  "https://winefolly.com/",
];

const CL_SOURCES = [
  "https://www.winesofchile.org/",
];

const ZA_SOURCES = [
  "https://www.wosa.co.za/",
];

const AU_SOURCES = [
  "https://www.wineaustralia.com/",
];

const NZ_SOURCES = [
  "https://www.nzwine.com/",
];

const AR_SOURCES = [
  "https://www.winesofargentina.org/",
];

export const LEAF_GRAPE_PROFILES: Record<string, LeafGrapeProfile> = {
  "detail:adelaide-hills": { grapes: ["Sauvignon Blanc", "Chardonnay", "Pinot Noir", "Shiraz", "Riesling"], sources: AU_SOURCES },
  "detail:asti": { grapes: ["Moscato Bianco"], sources: IT_SOURCES },
  "detail:barbaresco": { grapes: ["Nebbiolo"], sources: IT_SOURCES },
  "detail:barbera-dasti": { grapes: ["Barbera"], sources: IT_SOURCES },
  "detail:barolo": { grapes: ["Nebbiolo"], sources: IT_SOURCES },
  "detail:barossa-valley": { grapes: ["Shiraz", "Cabernet Sauvignon", "Grenache"], sources: AU_SOURCES },
  "detail:brunello-di-montalcino": { grapes: ["Sangiovese"], sources: IT_SOURCES },
  "detail:chablis": { grapes: ["Chardonnay"], sources: FR_SOURCES },
  "detail:chateauneuf-du-pape": { grapes: ["Grenache", "Syrah", "Mourvedre"], sources: FR_SOURCES },
  "detail:chianti": { grapes: ["Sangiovese", "Canaiolo", "Colorino", "Merlot", "Cabernet Sauvignon"], sources: IT_SOURCES },
  "detail:clare-valley": { grapes: ["Riesling", "Shiraz", "Cabernet Sauvignon"], sources: AU_SOURCES },
  "detail:colchagua-valley": { grapes: ["Cabernet Sauvignon", "Carmenere", "Syrah", "Malbec"], sources: CL_SOURCES },
  "detail:condrieu": { grapes: ["Viognier"], sources: FR_SOURCES },
  "detail:constantia": { grapes: ["Sauvignon Blanc", "Muscat de Frontignan"], sources: ZA_SOURCES },
  "detail:coonawarra": { grapes: ["Cabernet Sauvignon", "Shiraz"], sources: AU_SOURCES },
  "detail:cote-de-beaune": { grapes: ["Chardonnay", "Pinot Noir"], sources: FR_SOURCES },
  "detail:cote-de-nuits": { grapes: ["Pinot Noir", "Chardonnay"], sources: FR_SOURCES },
  "detail:cote-rotie": { grapes: ["Syrah", "Viognier"], sources: FR_SOURCES },
  "detail:crozes-hermitage": { grapes: ["Syrah", "Marsanne", "Roussanne"], sources: FR_SOURCES },
  "detail:eden-valley": { grapes: ["Riesling", "Shiraz"], sources: AU_SOURCES },
  "detail:elgin": { grapes: ["Pinot Noir", "Chardonnay", "Sauvignon Blanc"], sources: ZA_SOURCES },
  "detail:fiano-di-avellino": { grapes: ["Fiano"], sources: IT_SOURCES },
  "detail:fleurie": { grapes: ["Gamay"], sources: FR_SOURCES },
  "detail:gavi": { grapes: ["Cortese"], sources: IT_SOURCES },
  "detail:graves": { grapes: ["Cabernet Sauvignon", "Merlot", "Cabernet Franc", "Sauvignon Blanc", "Semillon"], sources: FR_SOURCES },
  "detail:haut-medoc": { grapes: ["Cabernet Sauvignon", "Merlot", "Cabernet Franc", "Petit Verdot"], sources: FR_SOURCES },
  "detail:hermitage": { grapes: ["Syrah", "Marsanne", "Roussanne"], sources: FR_SOURCES },
  "detail:hunter-valley": { grapes: ["Semillon", "Shiraz", "Chardonnay"], sources: AU_SOURCES },
  "detail:maconnais": { grapes: ["Chardonnay", "Gamay", "Pinot Noir"], sources: FR_SOURCES },
  "detail:maipo-valley": { grapes: ["Cabernet Sauvignon", "Carmenere", "Merlot", "Syrah"], sources: CL_SOURCES },
  "detail:margaret-river": { grapes: ["Cabernet Sauvignon", "Chardonnay", "Sauvignon Blanc", "Semillon"], sources: AU_SOURCES },
  "detail:margaux": { grapes: ["Cabernet Sauvignon", "Merlot", "Cabernet Franc", "Petit Verdot"], sources: FR_SOURCES },
  "detail:mclaren-vale": { grapes: ["Shiraz", "Grenache", "Cabernet Sauvignon"], sources: AU_SOURCES },
  "detail:montepulciano-dabruzzo": { grapes: ["Montepulciano"], sources: IT_SOURCES },
  "detail:mornington-peninsula": { grapes: ["Pinot Noir", "Chardonnay", "Pinot Gris"], sources: AU_SOURCES },
  "detail:oakville": { grapes: ["Cabernet Sauvignon", "Merlot", "Cabernet Franc"], sources: US_SOURCES },
  "detail:pauillac": { grapes: ["Cabernet Sauvignon", "Merlot", "Cabernet Franc", "Petit Verdot"], sources: FR_SOURCES },
  "detail:pessac-leognan": { grapes: ["Cabernet Sauvignon", "Merlot", "Cabernet Franc", "Sauvignon Blanc", "Semillon"], sources: FR_SOURCES },
  "detail:pomerol": { grapes: ["Merlot", "Cabernet Franc"], sources: FR_SOURCES },
  "detail:pouilly-fume": { grapes: ["Sauvignon Blanc"], sources: FR_SOURCES },
  "detail:priorat": { grapes: ["Garnacha", "Carinena", "Syrah", "Cabernet Sauvignon"], sources: ES_PT_SOURCES },
  "detail:rutherford": { grapes: ["Cabernet Sauvignon", "Merlot", "Cabernet Franc"], sources: US_SOURCES },
  "detail:saint-emilion": { grapes: ["Merlot", "Cabernet Franc", "Cabernet Sauvignon"], sources: FR_SOURCES },
  "detail:sancerre": { grapes: ["Sauvignon Blanc", "Pinot Noir"], sources: FR_SOURCES },
  "detail:sauternes": { grapes: ["Semillon", "Sauvignon Blanc", "Muscadelle"], sources: FR_SOURCES },
  "detail:soave": { grapes: ["Garganega", "Trebbiano di Soave", "Chardonnay"], sources: IT_SOURCES },
  "detail:stellenbosch": { grapes: ["Cabernet Sauvignon", "Merlot", "Shiraz", "Chenin Blanc", "Sauvignon Blanc"], sources: ZA_SOURCES },
  "detail:touraine": { grapes: ["Sauvignon Blanc", "Chenin Blanc", "Cabernet Franc"], sources: FR_SOURCES },
  "detail:valpolicella": { grapes: ["Corvina", "Corvinone", "Rondinella", "Molinara"], sources: IT_SOURCES },
  "detail:verdicchio-dei-castelli-di-jesi": { grapes: ["Verdicchio"], sources: IT_SOURCES },
  "detail:vouvray": { grapes: ["Chenin Blanc"], sources: FR_SOURCES },
  "detail:walker-bay": { grapes: ["Pinot Noir", "Chardonnay", "Sauvignon Blanc"], sources: ZA_SOURCES },
  "detail:yarra-valley": { grapes: ["Pinot Noir", "Chardonnay", "Cabernet Sauvignon", "Shiraz"], sources: AU_SOURCES },
  "region:ORE": { grapes: ["Pinot Noir", "Chardonnay", "Pinot Gris"], sources: US_SOURCES },
  "subregion:alsace": { grapes: ["Riesling", "Gewurztraminer", "Pinot Gris", "Muscat", "Pinot Blanc", "Pinot Noir"], sources: FR_SOURCES },
  "subregion:casablanca-valley": { grapes: ["Sauvignon Blanc", "Chardonnay", "Pinot Noir"], sources: CL_SOURCES },
  "subregion:central-otago": { grapes: ["Pinot Noir", "Chardonnay", "Riesling", "Pinot Gris"], sources: NZ_SOURCES },
  "subregion:champagne": { grapes: ["Chardonnay", "Pinot Noir", "Pinot Meunier"], sources: FR_SOURCES },
  "subregion:hawkes-bay": { grapes: ["Cabernet Sauvignon", "Merlot", "Syrah", "Chardonnay", "Sauvignon Blanc"], sources: NZ_SOURCES },
  "subregion:jerez": { grapes: ["Palomino", "Pedro Ximenez", "Moscatel"], sources: ES_PT_SOURCES },
  "subregion:languedoc-roussillon": { grapes: ["Grenache", "Syrah", "Mourvedre", "Carignan", "Cinsault"], sources: FR_SOURCES },
  "subregion:los-carneros": { grapes: ["Pinot Noir", "Chardonnay"], sources: US_SOURCES },
  "subregion:marlborough": { grapes: ["Sauvignon Blanc", "Pinot Noir", "Chardonnay"], sources: NZ_SOURCES },
  "subregion:martinborough": { grapes: ["Pinot Noir", "Sauvignon Blanc", "Chardonnay", "Riesling"], sources: NZ_SOURCES },
  "subregion:mendoza": { grapes: ["Malbec", "Cabernet Sauvignon", "Bonarda", "Tempranillo", "Chardonnay"], sources: AR_SOURCES },
  "subregion:mosel": { grapes: ["Riesling"], sources: DE_SOURCES },
  "subregion:navarra": { grapes: ["Garnacha", "Tempranillo", "Cabernet Sauvignon", "Merlot", "Chardonnay"], sources: ES_PT_SOURCES },
  "subregion:pfalz": { grapes: ["Riesling", "Pinot Blanc", "Pinot Gris", "Spatburgunder"], sources: DE_SOURCES },
  "subregion:port": { grapes: ["Touriga Nacional", "Touriga Franca", "Tinta Roriz", "Tinta Barroca", "Tinto Cao"], sources: ES_PT_SOURCES },
  "subregion:prosecco": { grapes: ["Glera"], sources: IT_SOURCES },
  "subregion:provence": { grapes: ["Grenache", "Cinsault", "Mourvedre", "Syrah", "Rolle"], sources: FR_SOURCES },
  "subregion:puglia": { grapes: ["Primitivo", "Negroamaro", "Nero di Troia"], sources: IT_SOURCES },
  "subregion:rheingau": { grapes: ["Riesling", "Spatburgunder"], sources: DE_SOURCES },
  "subregion:rias-baixas": { grapes: ["Albarino"], sources: ES_PT_SOURCES },
  "subregion:ribera-del-duero": { grapes: ["Tempranillo", "Cabernet Sauvignon", "Merlot", "Malbec"], sources: ES_PT_SOURCES },
  "subregion:rioja": { grapes: ["Tempranillo", "Garnacha", "Graciano", "Mazuelo", "Viura"], sources: ES_PT_SOURCES },
  "subregion:santa-barbara-county": { grapes: ["Pinot Noir", "Chardonnay", "Syrah", "Sauvignon Blanc"], sources: US_SOURCES },
  "subregion:sonoma": { grapes: ["Pinot Noir", "Chardonnay", "Cabernet Sauvignon", "Zinfandel"], sources: US_SOURCES },
  "subregion:tasmania": { grapes: ["Pinot Noir", "Chardonnay", "Riesling", "Sauvignon Blanc"], sources: AU_SOURCES },
};
