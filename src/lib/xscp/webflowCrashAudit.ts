const PAGE_ID_PLACEHOLDER = "__MASTER_COLLECTION_CURRENT_PAGE_ID__";

export function collectWebflowPasteCrashHazards(xscpData: unknown): string[] {
  const hazards: string[] = [];
  const seen = new Set<string>();

  function add(hazard: string) {
    if (seen.has(hazard)) return;
    seen.add(hazard);
    hazards.push(hazard);
  }

  if (!isRecord(xscpData) || xscpData.type !== "@webflow/XscpData") {
    add("root is not @webflow/XscpData");
    return hazards;
  }

  const payload = isRecord(xscpData.payload) ? xscpData.payload : {};

  if (Array.isArray(payload.assets) && payload.assets.length > 0) {
    add("payload.assets[] populated");
  }

  const localImageRefs = collectLocalImageRefs(payload);
  if (localImageRefs.length > 0) {
    add(`local image URL(s) remain: ${summarizeRefs(localImageRefs)}`);
  }

  if (JSON.stringify(payload).includes(PAGE_ID_PLACEHOLDER)) {
    add("pageId placeholder remains");
  }

  if (JSON.stringify(payload).includes("selectorGuids")) {
    add("selectorGuids remain in paste payload");
  }

  collectIx3ShapeHazards(payload.ix3).forEach(add);

  return hazards;
}

export function assertWebflowPasteSafe(xscpData: unknown): void {
  const hazards = collectWebflowPasteCrashHazards(xscpData);
  if (hazards.length > 0) {
    throw new Error(`Final Webflow paste payload is blocked: ${hazards.join("; ")}`);
  }
}

function collectIx3ShapeHazards(ix3: unknown): string[] {
  const hazards: string[] = [];
  const seen = new Set<string>();

  function add(hazard: string) {
    if (seen.has(hazard)) return;
    seen.add(hazard);
    hazards.push(hazard);
  }

  function labelFor(item: unknown, fallback: string) {
    return isRecord(item) && (item.id || item._id || item.name)
      ? String(item.id || item._id || item.name)
      : fallback;
  }

  function isEmptyClassFilterTarget(target: unknown) {
    return Array.isArray(target) && target[0] === "wf:class" && Array.isArray(target[1]) && target[1].length === 0;
  }

  function visitTarget(target: unknown, label: string) {
    if (!Array.isArray(target)) {
      add(`IX3 target tuple is not an array: ${label}`);
      return;
    }

    const config = target.length >= 3 && isRecord(target[2]) ? target[2] : null;
    if (config && isEmptyClassFilterTarget(config.filterBy)) {
      add(`IX3 empty wf:class filterBy: ${label}`);
    }
  }

  if (ix3 == null) return hazards;
  if (!isRecord(ix3)) {
    add(Array.isArray(ix3) ? "IX3 root is an array" : "IX3 root is not an object");
    return hazards;
  }

  if (!Array.isArray(ix3.interactions)) {
    add("IX3 interactions is not an array");
  }
  if (!Array.isArray(ix3.timelines)) {
    add("IX3 timelines is not an array");
  }
  if (Object.prototype.hasOwnProperty.call(ix3, "actionLists") && !Array.isArray(ix3.actionLists)) {
    add("IX3 actionLists is not an array");
  }
  if (Object.prototype.hasOwnProperty.call(ix3, "events") && !Array.isArray(ix3.events)) {
    add("IX3 events is not an array");
  }

  (Array.isArray(ix3.interactions) ? ix3.interactions : []).forEach((interaction, interactionIndex) => {
    const interactionLabel = labelFor(interaction, `interaction[${interactionIndex}]`);
    if (!isRecord(interaction)) {
      add(`IX3 interaction is not an object: ${interactionLabel}`);
      return;
    }
    if (!Array.isArray(interaction.triggers)) {
      add(`IX3 interaction triggers is not an array: ${interactionLabel}`);
      return;
    }
    interaction.triggers.forEach((trigger) => {
      if (!Array.isArray(trigger)) {
        add(`IX3 trigger tuple is not an array: ${interactionLabel}`);
      } else if (trigger.length >= 3) {
        visitTarget(trigger[2], interactionLabel);
      }
    });
  });

  (Array.isArray(ix3.timelines) ? ix3.timelines : []).forEach((timeline, timelineIndex) => {
    const timelineLabel = labelFor(timeline, `timeline[${timelineIndex}]`);
    if (!isRecord(timeline)) {
      add(`IX3 timeline is not an object: ${timelineLabel}`);
      return;
    }
    if (!Array.isArray(timeline.actions)) {
      add(`IX3 timeline actions is not an array: ${timelineLabel}`);
      return;
    }
    timeline.actions.forEach((action) => {
      const actionLabel = labelFor(action, timelineLabel);
      if (!isRecord(action)) {
        add(`IX3 action is not an object: ${timelineLabel}`);
        return;
      }
      if (!Array.isArray(action.targets)) {
        add(`IX3 action targets is not an array: ${actionLabel}`);
      } else {
        action.targets.forEach((target) => {
          visitTarget(target, actionLabel);
        });
      }
      if (Object.prototype.hasOwnProperty.call(action, "keyframes") && !Array.isArray(action.keyframes)) {
        add(`IX3 action keyframes is not an array: ${actionLabel}`);
      }
    });
  });

  return hazards;
}

function collectLocalImageRefs(payload: Record<string, unknown>): string[] {
  const refs = new Set<string>();
  walk(payload, (value) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed) return;

    const urlMatches = trimmed.matchAll(/url\((['"]?)(.*?)\1\)/g);
    for (const match of urlMatches) {
      addLocalImageRef(refs, match[2]);
    }

    addLocalImageRef(refs, trimmed);
  });
  return Array.from(refs).sort();
}

function addLocalImageRef(refs: Set<string>, value: string) {
  const candidate = value.trim().replace(/^['"]|['"]$/g, "");
  if (!candidate) return;
  if (/^(https?:|data:|blob:|#|mailto:|tel:)/i.test(candidate)) return;
  if (/\.(png|jpe?g|gif|webp|svg|avif)(\?|#|$)/i.test(candidate)) {
    refs.add(candidate);
  }
}

function summarizeRefs(refs: string[]) {
  const limit = 8;
  return refs.length > limit ? `${refs.slice(0, limit).join(", ")} +${refs.length - limit} more` : refs.join(", ");
}

function walk(value: unknown, visit: (value: unknown) => void) {
  visit(value);
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, visit));
    return;
  }
  if (!isRecord(value)) return;
  Object.values(value).forEach((nextValue) => walk(nextValue, visit));
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
