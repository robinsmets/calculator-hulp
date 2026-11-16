/**
 * INSTELLINGEN
 *
 * Dit is het bestand waar je dingen aanpast. Alles hieronder mag je wijzigen
 * zonder ergens anders iets te veranderen.
 *
 * Let op: dit is een van de weinige plekken waar de uitleg in het Nederlands
 * staat, juist omdat dit het bestand is dat jij aanpast. De rest van de code
 * is Engels.
 *
 * Na een wijziging: ga naar chrome://extensions en klik op het herlaad-icoon
 * bij "Calculator hulp". Herlaad daarna ook het tabblad met de Calculatietool
 * (F5), anders draait daar nog de oude versie.
 */

/**
 * WAAR HET PANEEL VERSCHIJNT
 *
 * De extensie doet alleen iets op de ruimte-pagina van de Calculatietool. Die
 * herken je aan dit stukje in de adresbalk.
 *
 * Verandert deatabix de adressen van hun pagina's, dan moet dit mee. Klopt het
 * niet meer, dan verschijnt het paneel nergens meer — zonder foutmelding.
 */
export const PAGE_PATH = "/editors/calculatie/ruimtes/";

/**
 * Dezelfde herkenning, maar dan voor de Controletool. Beide tools staan op
 * hetzelfde domein en gebruiken dezelfde reparatiecodes/Schades-koppeling; het
 * paneel verschijnt op allebei de paginatypes.
 */
export const CONTROLE_PAGE_PATH = "/editors/controle/beoordelen/ruimte/";

/**
 * REPARATIECODES DIE STUCLOPER BETEKENEN
 *
 * Staat er op een schade een reparatieregel met een van deze codes, dan telt
 * die schade mee voor de stucloper-berekening. Alle wanden met zo'n schade
 * worden opgeteld. Geldt voor zowel de Calculatietool als de Controletool.
 *
 * Komt er een nieuwe code bij, zet die er dan gewoon achter. Je kunt dit ook
 * per dossier aanpassen via het instellingenscherm van de extensie; wat je
 * daar invult wint van deze lijst.
 */
export const DEFAULT_TRIGGER_CODES = ["B514", "B515", "B516", "B518", "G122", "B104"];

/**
 * VAKTERMEN VOOR DE CORRECTIE-CHECK
 *
 * Een correctieregel typ je zelf, dus die staat er nooit letterlijk hetzelfde
 * als de reparatieregel waar hij bij hoort. Om ze toch aan elkaar te knopen
 * kijkt de extensie of er een van deze woorden in allebei voorkomt. Staat
 * "stucwerk" in de correctie én in een reparatieregel, dan is dat een sterke
 * aanwijzing dat ze bij elkaar horen.
 *
 * Vul gerust aan met termen die in jouw dossiers vaak voorkomen.
 *
 * ⚠️ DE VOLGORDE IS BELANGRIJK. De extensie pakt het EERSTE woord dat in
 * allebei voorkomt. Daarom staat het meest specifieke woord vooraan:
 *
 *     "stucloper" vóór "stucwerk"
 *     "vloerplint" vóór "plint"
 *     "trapgat" / "trapleuning" / "trapopgang" vóór "trap"
 *     "rolsteiger" vóór "steiger"
 *
 * Zou je deze lijst alfabetisch sorteren, dan kiest de extensie ineens andere
 * woorden, en daarmee andere reparatieregels om tegen af te zetten. Dan kan
 * een waarschuwing verdwijnen die er wél had moeten staan. Zet nieuwe woorden
 * dus op de goede plek: specifiek boven algemeen.
 *
 * Daarom staat "radiator" vooraan bij de specifieke woorden en "leiding"
 * achteraan bij de algemene: een correctie over "radiatoren/-leidingen" hoort
 * bij de radiatorenregel, niet bij de elektraleidingen.
 *
 * ⚠️ "leiding" zit ook in "begeleiding". Komt dat woord in jouw omschrijvingen
 * voor, dan telt die regel mee als leidingwerk. Jij hebt dat afgewogen en voor
 * "leiding" gekozen; haal het woord weg als het in de praktijk tegenvalt.
 */
export const DEFAULT_TREFWOORDEN = [
  "stucloper", "stucwerk", "structuursaus", "sauswerk", "spackwerk", "spuitwerk",
  "vloerplint", "plint", "schilderwerk", "behang", "gipsplaat", "radiator", "voegwerk",
  "trapgat", "trapleuning", "trapopgang", "trap", "afdekken", "dekvloer", "afwerklaag", "uitvlakken",
  "plafond", "kozijn", "vloer", "wand", "schoorsteen", "dak", "isolatie", "leiding", "gevel",
  "rolsteiger", "steiger"
];

/**
 * TERMEN WAARVAN DE POSTEN BIJ ELKAAR OPGETELD WORDEN
 *
 * Normaal wordt een correctie afgezet tegen één reparatieregel: de best
 * passende. Twee regels kunnen namelijk toevallig hetzelfde woord bevatten
 * zonder bij elkaar te horen ("Sauswerk wanden" en "Sauswerk plafonds"), en
 * die zomaar optellen zou een echte overschrijding kunnen verbergen.
 *
 * Bij steigerwerk ligt dat anders. Vroeger stond dat als één post; nu worden
 * er standaard twee gecalculeerd (opbouw/afbraak én huur). Een correctie die
 * naar "rolsteiger" verwijst moet dus tegen de SOM van die twee afgezet
 * worden, anders lijkt het een overschrijding terwijl dat het niet is.
 *
 * Bewust een korte lijst. Elk woord dat je hier toevoegt maakt de controle op
 * dat woord soepeler, en dus minder streng.
 *
 * Alles wat hier staat moet ook in DEFAULT_TREFWOORDEN staan, anders wordt het
 * nooit gekozen.
 */
export const SAMEN_OPTELLEN_TREFWOORDEN = ["rolsteiger", "steiger"];

/**
 * BOUWDELEN
 *
 * Een correctie wordt nooit gekoppeld aan een post die een ANDER bouwdeel
 * noemt. "Sauswerk binnenplafonds" deelt het vakwoord "sauswerk" met
 * "Sauswerk wanden", maar het plafond is niet de wand: zonder deze lijst werd
 * de plafondcorrectie tegen de wandpost afgezet en stond hij als "binnen
 * gematchte post", terwijl er in de ruimte helemaal geen plafondpost meer was.
 *
 * Noemt de correctie of de post geen van deze woorden, dan mag de koppeling
 * gewoon. Alleen als ze allebei een bouwdeel noemen en er geen één gelijk is,
 * wordt de post overgeslagen.
 */
export const BOUWDELEN = ["plafond", "wand", "vloer", "gevel"];

/**
 * KERNWOORDEN VOOR HET VERLAAGDE BTW-TARIEF
 *
 * De regel: elke CORRECTIEPOST hoort standaard 21% BTW te hebben, BEHALVE als
 * de omschrijving stucadoors- of sauswerk betreft — dan is het verlaagde
 * tarief van 9% verplicht. De extensie controleert dit voor ELKE
 * correctiepost, dus ook eentje die niets met stuc-/sauswerk te maken heeft:
 * staat die niet op 21% (bijvoorbeeld per ongeluk op 0%), dan verschijnt ook
 * daar een waarschuwing.
 *
 * Dit is los van de vaktermenlijst hierboven: die lijst koppelt een correctie
 * aan de bijpassende reparatieregel, deze lijst bepaalt alleen welk BTW-tarief
 * verplicht is. Vul aan met andere woorden die bij jou altijd 9% moeten zijn.
 *
 * De korte woorden zijn stammen: "stuc" vangt ook "stucwerk"/"stuccen",
 * "schilder" ook "schilderwerk"/"schilderen". De langere ("sierpleister",
 * "betonemaille", "behangwerk") staan er voluit omdat ze geen kortere gemene
 * deler hebben.
 */
export const DEFAULT_VERLAAGD_BTW_TREFWOORDEN = [
  "stuc", "saus", "spack", "sierpleister", "schilder", "betonemaille", "behangwerk"
];

/**
 * UITZONDERINGEN OP HET VERLAAGDE BTW-TARIEF
 *
 * Woorden die zelf geen stuc-/sauswerk zijn, ook al gaat het vaak over werk
 * vlak bij of voor stucwerk/sauswerk. "Stucloper" is het afdekmateriaal voor
 * de vloer, "afdekken" is bescherming/voorbereiding — dat hoort net als elke
 * andere correctie gewoon bij het standaardtarief van 21%.
 *
 * Staat zo'n woord in de omschrijving, dan is het ALTIJD 21%, ook als er
 * daarnaast toevallig ook "stuc" of "saus" in de zin staat (bijvoorbeeld
 * "afdekken maaiveld bij stucadoorwerk" — het werk is afdekken, "bij
 * stucadoorwerk" zegt alleen waar dat naast gebeurt). Deze woorden winnen
 * dus altijd, ongeacht de rest van de omschrijving.
 */
export const DEFAULT_VERLAAGD_BTW_UITZONDERINGEN = ["stucloper", "afdekken"];

/**
 * GROOTTES VAN HET PANEEL
 *
 * De keuzes in het extensie-menu. Het getal is de schaal: 1 is normaal, 0.85
 * is 15% kleiner, 1.25 is een kwart groter.
 *
 * ⚠️ De namen links ("klein", "normaal", "groot") worden opgeslagen in de
 * browser en staan ook in het keuzemenu. Hernoem je er één, dan valt de
 * grootte terug op normaal en blijft het menu leeg. De getallen mag je wel
 * aanpassen.
 */
export const PANEEL_ZOOM = { klein: 0.85, normaal: 1, groot: 1.25, extragroot: 1.5 };

/**
 * STANDAARDINSTELLINGEN
 *
 * Wat er geldt zolang je zelf niets hebt ingesteld. Zodra je iets aanzet in
 * het paneel of het instellingenscherm, wordt dat onthouden en wint dat
 * hiervan.
 */
export const DEFAULTS = {
  /**
   * De hele extensie aan? Uitzetten laat het paneel nergens verschijnen,
   * zonder de extensie te verwijderen. Aan te passen via het extensie-icoon.
   */
  enabled: true,

  /** Reparatiecodes waarop de stucloper-berekening aanslaat. */
  triggerCodes: DEFAULT_TRIGGER_CODES,

  /** Parkeeruren standaard tonen? Staat uit: niet elk dossier heeft het nodig. */
  parkingEnabled: false,

  /** Correctie-check standaard tonen? Staat uit, om dezelfde reden. */
  correctionCheckEnabled: false,

  /** BTW-check standaard tonen? Alleen in de P3-versie; staat aan. */
  vatCheckEnabled: true,

  /** Eigen lijst vaktermen. null betekent: gebruik DEFAULT_TREFWOORDEN. */
  correctionKeywords: null,

  /** Eigen kernwoorden voor het verlaagde BTW-tarief. null = gebruik DEFAULT_VERLAAGD_BTW_TREFWOORDEN. */
  verlaagdBtwKeywords: null,

  /** Eigen uitzonderingen op het verlaagde BTW-tarief. null = gebruik DEFAULT_VERLAAGD_BTW_UITZONDERINGEN. */
  verlaagdBtwUitzonderingen: null,

  /**
   * De wand-/gevellijst standaard opengeklapt tonen? Staat uit: bij veel
   * wanden/gevels (buitenkant-gebouw-pagina's kunnen er tientallen hebben)
   * duwt een lange lijst Parkeeruren en Correctie-check anders uit beeld.
   * Het totaal blijft altijd zichtbaar; dit bepaalt alleen de losse regels.
   */
  wallListExpanded: false,

  /** Paneel geminimaliseerd tot alleen de titelbalk? Aan/uit via het paneel zelf. */
  panelMinimized: false,

  /** Waar het paneel staat. null betekent: rechtsonder, de standaardplek. */
  panelPosition: null,

  /** "klein", "normaal", "groot" of "extragroot" — zie PANEEL_ZOOM hierboven. */
  panelSize: "normaal"
};

/**
 * WAAR DE MELDINGEN IN DE CONSOLE MEE BEGINNEN
 *
 * Druk op F12 op de pagina en zoek op dit woord om te zien wat de extensie
 * heeft gevonden. Het paneel en het extensie-menu verwijzen hier allebei naar,
 * dus als je dit aanpast klopt die uitleg niet meer.
 */
export const LOG_PREFIX = "[Calculator-hulp]";
