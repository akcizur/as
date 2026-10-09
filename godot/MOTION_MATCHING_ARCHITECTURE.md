# Motion Matching — architektura Player Controlleru

> Stav: návrh architektury, nikoliv hotová implementace Motion Matchingu.
> Cíl: maximálně realistická locomotion v nativní hře Godot 4.6.1. Webový export zůstává sekundárním cílem.

## 1. Rozhodnutí

- Zachovat Godot jako primární runtime a současný CharacterBody3D jako autoritu pro kolize, gravitaci a kontakt se světem.
- Navrhnout Motion Matching jako hlavní systém výběru locomotion póz.
- Používat root motion selektivně a pouze přes řízenou integraci s fyzikálním motorem.
- Nejdříve ověřit algoritmus v izolované testovací scéně; neprovádět plošný přepis současného controlleru.
- Nepovažovat AnimationTree, BlendSpace nebo sémantickou knihovnu klipů za hotovou implementaci Motion Matchingu.

## 2. Architektura a datový tok

    InputRouter
      └─ LocomotionIntent
           ├─ desired_velocity
           ├─ facing_direction
           ├─ future_trajectory
           └─ requested_action
                 ↓
    CharacterMotor (CharacterBody3D)
      ├─ acceleration / braking
      ├─ gravity / jump / floor contact
      ├─ collision resolution
      └─ actual velocity and grounded state
                 ↓
    MotionMatchingRuntime
      ├─ build query from current pose + trajectory
      ├─ search preprocessed pose database
      ├─ select candidate and continuation frame
      └─ blend / inertial transition
                 ↓
    AnimationPostProcessor
      ├─ foot locking and foot IK
      ├─ slope / contact correction
      └─ optional hand IK and upper-body layer
                 ↓
    VisualRig + CameraRig

### Vlastnictví odpovědností

| Modul | Odpovědnost | Nesmí dělat |
|---|---|---|
| InputRouter | Převod klávesnice, myši, gamepadu a touch na jednotné akce | Měnit transformaci kostry |
| LocomotionIntent | Cílový směr, rychlost, orientace a předpověď trajektorie | Řešit fyzikální kolize |
| CharacterMotor | Fyzikální rychlost, gravitace, floor snap a kolize | Vybírat animační snímky |
| MotionMatchingDatabase | Předpočítaná metadata a rysy klipů | Provádět import celé knihovny za běhu |
| MotionMatchingRuntime | Dotaz, skórování kandidátů, výběr návaznosti | Obcházet CharacterMotor |
| AnimationPostProcessor | IK, uzamčení chodidel a kontaktní korekce | Maskovat chybné měřítko nebo nekvalitní klipy |
| CameraRig | Kamera, kolize kamery, limity pitch | Ovlivňovat fyzikální pohyb postavy |

Názvy označují logické moduly; nemusí nutně odpovídat samostatným skriptům v první iteraci.

## 3. Motion Matching runtime

Každý kandidátní snímek v databázi musí mít předpočítané rysy. Počáteční sada:

- lokální pozice a orientace vybraných klíčových kostí;
- lokální lineární a případně úhlové rychlosti;
- pozice a směry trajektorie v několika budoucích časových bodech;
- stav kontaktu chodidel, pokud je spolehlivě dostupný;
- masky režimů: locomotion, crouch, aim a další ověřené kategorie;
- metadata klipu, čas snímku, povolené přechody a identita skeletonu.

Runtime dotaz skládá z aktuální pózy, skutečné rychlosti CharacterMotoru a požadované budoucí trajektorie. Skóre kandidáta kombinuje odchylku pózy, rychlosti a trajektorie s penalizací za nevhodný přechod. Váhy se musí ladit pomocí debug vizualizace a testovacích scén, ne odhadem bez měření.

Vyhledávání nesmí v každém snímku procházet a dekódovat všechny animační klipy. Databáze a rysy se generují při importu nebo v editorovém nástroji. Runtime používá kompaktní předpočítaná data a může využít hrubý filtr či index, pokud měření prokáže potřebu.

## 4. Zdrojová animační knihovna

Rozsah se rozšiřuje postupně; počet souborů sám o sobě není metrikou kvality.

### Fáze A — Locomotion Core
- idle a přechody idle → pohyb;
- chůze a běh vpřed, vzad a do stran;
- diagonální pohyb a různé rychlosti;
- start, stop, braking a změna směru;
- malé i ostré zatáčky, pivot a turn-in-place.

### Fáze B — dynamické situace
- sprint a přechody walk/run/sprint;
- prudké změny směru a obraty 90°/180°;
- crouch locomotion;
- aim locomotion a oddělená horní část těla, pokud je rig kompatibilní.

### Fáze C — full-body a kontakt
- jump start, in-air, fall a land;
- úhyby, schody a svahy;
- interakce s překážkami a předměty;
- kontextové pohyby až po ověření základní databáze.

### Validace každého klipu
1. Stejný skeleton, hierarchie kostí a konzistentní názvy/mapování.
2. Konzistentní měřítko, jednotky, forward axis a rest pose.
3. Ověřená délka, snímková frekvence a loop hranice.
4. Správně zpracovaný root transform a root motion.
5. Bez nechtěného driftu, deformace kostry a neplatných kontaktů chodidel.
6. Licence a původ assetu zaznamenané v manifestu.

Nejdříve použít malou, kvalitní a právně ověřenou sadu. Rozsáhlou knihovnu přidávat až poté, co je prokázána kvalita výběru a návaznosti.

## 5. Fyzika, root motion a IK

### Autorita pohybu
CharacterBody3D zůstává autoritou pro kolize a skutečný pohyb v prostředí. Motion Matching dodává pózu a informaci o zamýšleném pohybu. Pokud se použije root motion, jeho delta se převede na požadovaný posun/rychlost a projde běžným fyzikálním krokem; nesmí přímo teleportovat postavu skrz překážky.

### Doporučená pravidla
- Nejdříve implementovat a měřit in-place locomotion s CharacterMotorem.
- Root motion zapínat po kategoriích klipů, nikoli globálním přepínačem bez validace.
- Porovnávat animační rychlost s reálnou rychlostí postavy, aby nedocházelo ke klouzání chodidel.
- Po move_and_slide() aktualizovat kontaktní stav; animační systém nesmí používat zastaralý floor state.
- Foot locking/IK zapnout až po správném měřítku modelu a stabilním root motion.
- Skok a pád odvozovat také z fyzikálního stavu, ne pouze z názvu klipu.
- Kamera a vizuální rig nesmějí měnit kolizní kapsli.

## 6. Návrh adresářů

Následující struktura je cílový návrh, nikoli příkaz vytvořit všechny soubory najednou:

    godot/
      scripts/
        player/
          input_router.gd
          locomotion_intent.gd
          character_motor.gd
          motion_matching_runtime.gd
          animation_post_processor.gd
          camera_rig.gd
      addons/
        motion_matching/          # pouze po ověření licence a kompatibility
      tools/
        motion_database_builder/  # editorový/preprocessing nástroj
      tests/
        motion_matching_sandbox.tscn
        motion_matching_test.gd
      assets/
        animation_library/
          manifest.json           # zdroj, licence, skeleton, tagy a validace
      docs/
        MOTION_MATCHING_DATA.md

Při implementaci nejprve zmapovat současné skripty a jejich odpovědnosti. Nové moduly zavádět postupně a neponechávat dvě paralelní autority pro stejný stav.

## 7. Výběr technologie

Nejdříve provést krátký technický spike se dvěma možnostmi:

1. **Komunitní Godot Motion Matching řešení** — prověřit podporu Godot 4.6.1, kvalitu databáze, možnost generování vlastních rysů, práci s root motion, licenci, nativní výkon a stav údržby.
2. **Vlastní runtime** — zvažovat pouze tehdy, když plugin nevyhoví konkrétním požadavkům. Oddělit databázový builder od runtime a držet datový formát verzovaný.

Nepřidávat plugin do produkčního projektu, dokud nejsou ověřeny licence, kompatibilita a reprodukovatelný test. GDExtension/C++ je optimalizační možnost až po profilování, nikoliv výchozí požadavek.

## 8. Nativní hra a webový export

- Nativní desktop build je referenční profil pro kvalitu pohybu, paměť a snímkovou dobu.
- Webový export je sekundární cíl s vlastními rozpočty pro velikost, načítání, paměť a výpočet vyhledávání.
- Sdílet datový formát a herní pravidla, nikoli předpokládat identické výkonnostní limity.
- Načíst nejprve minimální scénu a databázi připravit/načítat tak, aby se nezablokoval první ovladatelný frame.
- Velikost datasetu, čas importu, dobu načítání a náklady vyhledávání měřit samostatně.

## 9. Akceptační testy

| Oblast | Akceptační kritérium |
|---|---|
| Plynulost | Žádné viditelné škubnutí při běžných přechodech; kandidátní přechody jsou debugovatelné |
| Start/stop | Rozběh, změna rychlosti a brzdění odpovídají požadované trajektorii |
| Změna směru | Rychlé otočky nevyvolávají nepřirozené křížení nohou ani skok v orientaci |
| Kontakt | Chodidla na rovné ploše nekloužou nepřijatelně; na svahu se opravuje kontakt |
| Kolize | Postava neprochází geometrií ani při aktivním root motion |
| Země a skok | Grounded, jump, fall a land odpovídají skutečnému fyzikálnímu stavu |
| Kamera | Stabilní third-person kamera; kamera se nedostane pod stanovenou minimální výšku |
| Výkon | Zaznamenaná snímková doba, cena query, paměť databáze a doba načítání na cílovém zařízení |
| Robustnost | Chybějící nebo nekompatibilní klip vyvolá diagnostiku a bezpečný fallback |
| Web | Webový build se testuje odděleně; případné limity se dokumentují, nikoli skrývají |

Před začátkem implementace musí být stanovena konkrétní cílová zařízení a rozpočty výkonu. Bez nich nelze poctivě prohlásit controller za optimalizovaný.

## 10. Implementační plán

1. **Audit (bez změn runtime):** zmapovat současný controller, AnimationTree, dostupné klipy, skeleton a build workflow.
2. **Technický spike:** ověřit plugin nebo minimální vlastní vyhledávání v oddělené sandbox scéně.
3. **Datový builder:** vytvořit validovaný manifest a předpočítané rysy pro malou locomotion sadu.
4. **Query a debug nástroje:** zobrazovat trajektorii, skóre kandidátů, vybraný klip/snímek a důvod výběru.
5. **Integrace locomotion:** postupně propojit Motion Matching s CharacterMotor bez rozbití stávajících vstupů a kolizí.
6. **Kontakt a root motion:** přidávat až po splnění základních testů.
7. **Profilování:** nativní profil jako první; webový profil následně.
8. **Rozšíření knihovny:** přidávat další kategorie jen po validaci kvality a licencí.

## 11. Co tento návrh netvrdí

- Motion Matching zatím není v projektu implementován jen tímto dokumentem.
- Stávající Mixamo model automaticky neobsahuje všechny potřebné animace.
- Plugin ani nativní rozšíření nebyly vybrány bez auditu.
- Realistický výsledek není zaručen samotným algoritmem: rozhoduje kvalita dat, pokrytí pohybových situací, návaznosti, fyzika a korekce kontaktů.
