export const FLAG_EXACT = 0;
export const FLAG_PREFIX = 1;
export const FLAG_SPACE = 2;

export class CommandManager {
  constructor() {
    this.actions = new Map();
  }

  addAction(object, func, verb, flag) {
    if (!this.actions.has(object)) this.actions.set(object, []);
    this.actions.get(object).push({ verb, func, flag });
  }

  removeActions(object) {
    this.actions.delete(object);
  }

  removeAction(object, verb) {
    const actions = this.actions.get(object);
    if (!actions) return;
    const idx = actions.findIndex(a => a.verb === verb);
    if (idx >= 0) actions.splice(idx, 1);
  }

  getActions(object) {
    return this.actions.get(object) ?? [];
  }

  matchVerb(input, action) {
    switch (action.flag) {
      case FLAG_EXACT:
        return input === action.verb;
      case FLAG_PREFIX:
        return input.startsWith(action.verb) && input.length >= action.verb.length;
      case FLAG_SPACE:
        return input === action.verb || input.startsWith(action.verb + ' ');
      default:
        return input === action.verb;
    }
  }

  getSearchList(player) {
    const list = [player];
    if (player.environment) {
      list.push(player.environment);
      for (const obj of player.environment.inventory) {
        if (obj !== player) list.push(obj);
      }
    }
    return list;
  }

  dispatch(input, handler, searchList) {
    const spaceIdx = input.indexOf(' ');
    const verb = spaceIdx >= 0 ? input.slice(0, spaceIdx) : input;
    const arg = spaceIdx >= 0 ? input.slice(spaceIdx + 1) : '';

    for (const obj of searchList) {
      for (const action of this.getActions(obj)) {
        if (this.matchVerb(verb, action)) {
          const handled = handler(action.func, obj, arg);
          if (handled) return true;
        }
      }
    }
    return false;
  }
}
