import type { Settings } from '../shared/types';

const RULESET = 'ads';
/** Dynamic rule ids reserved for "allow everything on this disabled site". */
const ALLOW_ID_BASE = 100_000;

/** Turns the static ad ruleset on/off and exempts disabled sites from it. */
export async function applyNetRules(settings: Settings): Promise<void> {
  const dnr = chrome.declarativeNetRequest;
  await dnr.updateEnabledRulesets(
    settings.networkBlocking ? { enableRulesetIds: [RULESET] } : { disableRulesetIds: [RULESET] },
  );

  const existing = await dnr.getDynamicRules();
  const removeRuleIds = existing.filter((r) => r.id >= ALLOW_ID_BASE).map((r) => r.id);
  const addRules: chrome.declarativeNetRequest.Rule[] = settings.disabledSites.map((site, i) => ({
    id: ALLOW_ID_BASE + i,
    priority: 100,
    action: { type: 'allowAllRequests' as chrome.declarativeNetRequest.RuleActionType },
    condition: {
      requestDomains: [site],
      resourceTypes: ['main_frame' as chrome.declarativeNetRequest.ResourceType, 'sub_frame' as chrome.declarativeNetRequest.ResourceType],
    },
  }));
  await dnr.updateDynamicRules({ removeRuleIds, addRules });
}

/** Number of requests blocked by our rules in a tab (needs declarativeNetRequestFeedback). */
export async function blockedCount(tabId: number): Promise<number> {
  try {
    const { rulesMatchedInfo } = await chrome.declarativeNetRequest.getMatchedRules({ tabId });
    return rulesMatchedInfo.filter((r) => r.rule.rulesetId === RULESET).length;
  } catch {
    return 0;
  }
}
