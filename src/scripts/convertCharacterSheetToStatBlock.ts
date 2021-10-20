import cash, { Cash } from "cash-dom";
import { StatBlock, AbilityScores, NameAndContent } from "./statblock";
import { AllOptions } from "./options";
import { IsConditionImmunity } from "./IsConditionImmunity";

export const convertCharacterSheetToStatBlock = async (options: AllOptions) => {
  const doc = cash(document);
  const characterSheetElement = doc.find(prefix("character-sheet"));
  const statBlock: Partial<StatBlock> = {
    Source: "",
    Name: characterSheetElement
      .find(prefix("character-name"))
      .text()
      .trim(),
    Type: characterSheetElement
      .find(prefix("character-summary__race"))
      .text()
      .trim(),
    HP: getHitPoints(characterSheetElement),
    AC: getArmorClass(characterSheetElement),
    Abilities: getAbilities(characterSheetElement),
    Speed: [characterSheetElement.find(prefix("speed-box__box-value")).text()],
    InitiativeModifier: Number(characterSheetElement.find(prefix('initiative-box__value'))
      .text()
      .trim().replace('+', '')),
    // InitiativeSpecialRoll?: "advantage" | "disadvantage" | "take-ten",
    // InitiativeAdvantage?: boolean,
    DamageVulnerabilities: getDefenses(characterSheetElement, "Vulnerability"),
    DamageResistances: getDefenses(characterSheetElement, "Resistance"),
    DamageImmunities: getDefenses(characterSheetElement, "Immunity").filter(
      (immunity) => !IsConditionImmunity(immunity)
    ),
    ConditionImmunities: getDefenses(
      characterSheetElement,
      "Immunity"
    ).filter((immunity) => IsConditionImmunity(immunity)),
    Saves: getSaves(characterSheetElement),
    Skills: getSkills(characterSheetElement),
    Senses: getSenses(characterSheetElement),
    Languages: getLanguages(characterSheetElement),
    Challenge: characterSheetElement
      .find(prefix("character-tidbits__classes"))
      .text()
      .trim(),
    Traits: await getTraits(characterSheetElement),
    Actions: await getActions(characterSheetElement),
    Reactions: [],
    LegendaryActions: [],
    ImageURL: getImageUrl(characterSheetElement),
    Description: options["include-link"] === 'on' ? `[Link to DNDB Character](${document.location.href})` : "",
    Player: "player",
  };
  return statBlock;
};

const activeClass = "ddbc-tab-list__nav-item--is-active"
async function changeTabAndWaitForActive(tab: Element) : Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // If it is already active resolve immediately.
    if(tab.classList.contains(activeClass)){
      resolve()
      return
    }
    // Create a dummy observer so this can't error out.
    let obs = new MutationObserver((msg)=>{});
    // Make the promise reject after a hard timeout and after disconnecting any observer.
    const deadline = setTimeout((msg) => {
      if(obs && obs.disconnect && typeof obs.disconnect === 'function'){
        obs.disconnect();
        console.log('MR Observer disconnected.'); 
      }
      reject(msg)
    }, 10000, 'Operation timed out waiting for actions tab.')
    // Create the real observer that resolves the promise if the tab is active.
    obs = new MutationObserver((mutationRecords) => {
      //TODO: parse the mutation list for class attribute changes instead.
      console.log(mutationRecords)
      // console.log(mutationRecords.map(mutRec => mutRec. && mutRec.target.contains(activeClass)).some(val => val))
      // if(document.getElementsByClassName(actionsTabClass)[0].classList.contains(activeClass)){
      if(mutationRecords.map(mrec => mrec.attributeName === 'class' && (mrec.target as Element).classList.contains(activeClass)).some(val=>val)){
        //Give it a moment to fully resolve.
        clearTimeout(deadline);
        setTimeout(resolve, 500)
        obs.disconnect()
      }
    })
    obs.observe(tab, {attributes: true, attributeFilter: ['class']})
    console.log('MR Observer watching tabs.');
    (tab as HTMLDivElement).click()
  })
}
// twloveduck 2021.10.19 -- Changes to pull actions out.
async function getActions(element: Cash) : Promise<NameAndContent[]> {
  //Need to use the document to use click if not selected.
  const actionsTabClass = "ct-primary-box__tab--actions"
  let tabs = document.getElementsByClassName(actionsTabClass) 
  if(! (tabs && tabs.length))
    throw "Couldn't find actions tab."

  let tab = tabs[0]
  if(!tab.classList.contains(activeClass)) {
    //The actions tab is not activated. Click then wait till active to parse the tab.
    
    await changeTabAndWaitForActive(tab).catch(err => {throw err})
  }

  var stii_actions = [...document.getElementsByClassName("ddbc-combat-attack")]
  console.log(stii_actions)
  const replaceRe = /\n/g
  function parseAction(ele) : NameAndContent {
    let name = ele.children[1].innerText.split('\n')
    
    //Pull the damage type from the tooltip and make sure something is sane in the text.
    let dType = ele.children[4].getElementsByClassName('ddbc-tooltip')
    dType = dType.length ? dType[0].getAttribute('data-original-title') : 'type unknown'
    dType = dType ? dType : 'type unknown'

    let dDice = ele.children[4].innerText.replace(replaceRe, ' 2✋🏼: ')
    return {
      Name: name[0],
      Content: (name.length > 1 ? name[1] + ' ': '') + 'attack: ' + 
        ele.children[3].innerText.replaceAll(replaceRe, '') + ', ' + 
        ele.children[2].innerText.replaceAll(replaceRe, ' ').trim() + 
        '. Hit: ' + dDice + ' ' + dType + ' damage. Notes: ' +
        ele.children[5].innerText
    }
  }
  // return []
  return stii_actions.map(ele => {
    if(ele.children && ele.children.length && ele.children.length >= 6)
    {
      return parseAction(ele)
    }
    else
      return undefined
  }).filter(item => item != undefined)
}

async function getTraits(ele:Cash) : Promise<NameAndContent[]> {
  //Need to use the document to use click if not selected.
  const spellsTabClass = "ct-primary-box__tab--spells"
  let tabs = document.getElementsByClassName(spellsTabClass) 
  if(! (tabs && tabs.length))
    return []

  let tab = tabs[0]
  await changeTabAndWaitForActive(tab).catch(err => {throw err})

  let spellBlock : any = document.getElementsByClassName('ct-spells__content');
  if(spellBlock && spellBlock.length)
    spellBlock = spellBlock[0]
  
  let spellLevels = [...spellBlock.getElementsByClassName("ct-content-group") as HTMLCollectionOf<HTMLDivElement>]
  if(! (spellLevels && spellLevels.length))
    return []

  //TODO: Pull attack and saves.
  let spellRtn = {Name: 'Spellcasting',Content: "Spell attack ?, Spell save DC ?\n• " + 
    spellLevels.map(ele=> 
      `${(ele.getElementsByClassName('ct-content-group__header-content')[0] as any).innerText.toLowerCase()} (${ele.getElementsByClassName('ct-slot-manager__slot').length} slots): ${[...ele.getElementsByClassName('ddbc-spell-name')].map((sname:any)=>sname.innerText).join(', ')}`).join('\n• ')
  }

  //TODO: Pull other traits.

  return [spellRtn]
}

function getHitPoints(element: Cash) {
  let maxHP = element
    .find(prefix("health-summary__hp-item-label"))
    .filter(
      (_, label) => cash(label).text().trim().toLocaleLowerCase() == "max"
    )
    .siblings(prefix("health-summary__hp-item-content"))
    .text()
    .trim();

  if (!maxHP?.length) {
    maxHP = element.find(".ct-status-summary-mobile__hp-max").text().trim();
  }

  return {
    Value: parseInt(maxHP),
    Notes: "",
  };
}

function getArmorClass(element: Cash) {
  return {
    Value: parseInt(
      element.find(prefix("armor-class-box__value")).text().trim()
    ),
    Notes: "",
  };
}

function getImageUrl(element: Cash) {
  const backgroundImageAttribute =
    element.find(prefix("character-tidbits__avatar")).css("background-image") ||
    "";
  if (!backgroundImageAttribute.length) {
    return "";
  }
  return backgroundImageAttribute.split('"')[1];
}

function getAbilities(element: Cash): AbilityScores {
  const abilityScoreSelector = resolveAbilityScoreSelector(element);
  return {
    Str: getAbility(element, "str", abilityScoreSelector),
    Dex: getAbility(element, "dex", abilityScoreSelector),
    Con: getAbility(element, "con", abilityScoreSelector),
    Int: getAbility(element, "int", abilityScoreSelector),
    Wis: getAbility(element, "wis", abilityScoreSelector),
    Cha: getAbility(element, "cha", abilityScoreSelector),
  };
}

function resolveAbilityScoreSelector(element: Cash) {
  const modifiersRegex = /[\+\-]/g;
  if (
    modifiersRegex.test(
      element.find(prefix("ability-summary__secondary")).text()
    )
  ) {
    return prefix("ability-summary__primary");
  } else {
    return prefix("ability-summary__secondary");
  }
}

function getAbility(
  element: Cash,
  ability: string,
  abilityScoreSelector: string
) {
  let score = 10;
  const scoreLabel = element
    .find(prefix("ability-summary__abbr"))
    .filter((_, element: Element) => element.textContent == ability);

  const scoreText = scoreLabel
    .parents(prefix("ability-summary"))
    .find(abilityScoreSelector)
    .text();
  try {
    score = parseInt(scoreText);
  } catch (e) {}
  return score;
}

function getDefenses(element: Cash, defenseType: string) {
  return element
    .find(`[data-original-title=${defenseType}]`)
    .parents(prefix("defenses-summary__group"))
    .find(prefix("defenses-summary__defense"))
    .get()
    .map((el) => cash(el).text());
}

function getSaves(element: Cash) {
  return element
    .find(`[data-original-title="Proficiency"]`)
    .parents(prefix("saving-throws-summary__ability"))
    .get()
    .map((el) => {
      const abilityName = cash(el)
        .find(prefix("saving-throws-summary__ability-name"))
        .text();
      const titleCasedAbilityName =
        abilityName.substr(0, 1).toLocaleUpperCase() + abilityName.substr(1);
      return {
        Name: titleCasedAbilityName,
        Modifier: parseInt(
          cash(el)
            .find(prefix("saving-throws-summary__ability-modifier"))
            .text()
        ),
      };
    });
}

function getSkills(element: Cash) {
  return element
    .find(
      `[data-original-title="Proficiency"], [data-original-title="Half Proficiency"], [data-original-title="Expertise"]`
    )
    .parents(prefix("skills__item"))
    .get()
    .map((el) => {
      return {
        Name: cash(el).find(prefix("skills__col--skill")).text(),
        Modifier: parseInt(cash(el).find(prefix("signed-number")).text()),
      };
    });
}

function getSenses(element: Cash) {
  const sensesString = element
    .find(prefix("senses__summary"))
    .text()
    .replace("Additional Sense Types", "");
  if (sensesString.length == 0) {
    return [];
  }

  return sensesString.split(/,\s*/);
}

function getLanguages(element: Cash) {
  return element
    .find(prefix("proficiency-groups__group-label"))
    .filter((_, el) => cash(el).text() == "Languages")
    .parents(prefix("proficiency-groups__group"))
    .find(prefix("proficiency-groups__group-items"))
    .text()
    .split(",")
    .map((s) => s.trim());
}

function prefix(suffix: string) {
  return `.ct-${suffix}, .ddbc-${suffix}`;
}
