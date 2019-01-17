import Animator, { IState, EasingType, isDirectionReverse } from "./Animator";
import Frame from "./Frame";
import {
  toFixed,
  isFixed,
  playCSS,
  toId,
  exportCSS,
  getRealId,
  makeId,
} from "./utils";
import Keyframes from "./Keyframes";
import { dotValue } from "./utils/dot";
import {
  START_ANIMATION,
  PREFIX, THRESHOLD,
  TIMING_FUNCTION, ALTERNATE, ALTERNATE_REVERSE, NORMAL, INFINITE,
  REVERSE, EASING, FILL_MODE, DIRECTION, ITERATION_COUNT,
  EASING_NAME, DELAY, PLAY_SPEED, DURATION, PAUSE_ANIMATION
} from "./consts";
import { isObject, isArray, isUndefined, decamelize,
  ANIMATION, fromCSS, addClass, removeClass, hasClass,
  KEYFRAMES, requestAnimationFrame, isFunction, IS_WINDOW, IObject } from "@daybrush/utils";
import { NameType, ElementsType } from "./types";

function makeAnimationProperties(properties: IObject<string | number>) {
  const cssArray = [];

  for (const name in properties) {
    cssArray.push(`${ANIMATION}-${decamelize(name)} : ${properties[name]};`);
  }
  return cssArray.join("");
}

/**
* manage Frame Keyframes and play keyframes.
* @extends Animator
* @example
const item = new SceneItem({
	0: {
		display: "none",
	},
	1: {
		display: "block",
		opacity: 0,
	},
	2: {
		opacity: 1,
	}
});
*/
class SceneItem extends Animator {
  public keyframes: Keyframes;
  public elements: ElementsType;
  /**
	* @param - properties
	* @param - options
	* @example
	const item = new SceneItem({
		0: {
			display: "none",
		},
		1: {
			display: "block",
			opacity: 0,
		},
		2: {
			opacity: 1,
		}
	});
	 */
  constructor(properties?: IObject<any>, options?: Partial<IState>) {
    super();
    this.keyframes = new Keyframes();
    this.elements = [];
    this.load(properties, options);
  }
  public getDuration() {
    return Math.max(this.state[DURATION], this.keyframes.getDuration());
  }
  public setDuration(duration: number) {
    if (duration === 0) {
      return this;
    }
    const originalDuration = this.getDuration();

    if (originalDuration > 0) {
      this.keyframes.setDuration(duration, originalDuration);
    }
    super.setDuration(toFixed(duration));
    return this;
  }
  /**
	* set the unique indicator of the item.
	* @param {String} [id] - the indicator of the item.
	* @return {SceneItem} An instance itself
	* @example
const item = new SceneItem();

item.setId("item");
console.log(item.getId()); // item
	*/
  public setId(id?: number | string) {
    const elements = this.elements;
    const length = elements.length;

    this.setState({ id: id || makeId(!!length) });
    const sceneId = toId(this.getId());

    this.state.selector || (this.state.selector = `[data-scene-id="${sceneId}"]`);

    if (!length) {
      return this;
    }
    for (let i = 0; i < length; ++i) {
      elements[i].setAttribute("data-scene-id", sceneId);
    }
    return this;
  }
  /**
	* Specifies the unique indicator of the item.
	* @return {String} the indicator of the item.
	* @example
const item = scene.newItem("item");
console.log(item.getId()); // item
	*/
  public getId() {
    return this.state.id;
  }
  /**
	* Set properties to the sceneItem at that time
	* @param {Number} time - time
	* @param {...String|Object} [properties] - property names or values
	* @return {SceneItem} An instance itself
	* @example
item.set(0, "a", "b") // item.getFrame(0).set("a", "b")
console.log(item.get(0, "a")); // "b"
	*/
  public set(time: any, ...args: any[]) {
    if (isObject(time)) {
      this.load(time);
      return this;
    } else if (args[0]) {
      if (args[0] instanceof SceneItem) {
        const item: SceneItem = args[0];
        const delay = item.getDelay();
        const realTime = this.getUnitTime(time);
        const frames = item.toObject(!this.hasFrame(realTime + delay), realTime);

        for (const frameTime in frames) {
          this.set(frameTime, frames[frameTime]);
        }
        return this;
      } else if (args.length === 1 && isArray(args[0])) {
        args[0].forEach((item: any) => {
          this.set(time, item);
        });
        return this;
      }
    }
    const frame = this.newFrame(time);

    frame.set(...args);
    this.updateFrame(frame);
    return this;
  }
  /**
	* Get properties of the sceneItem at that time
	* @param {Number} time - time
	* @param {...String|Object} args property's name or properties
	* @return {Number|String|PropertyObejct} property value
	* @example
item.get(0, "a"); // item.getFrame(0).get("a");
item.get(0, "transform", "translate"); // item.getFrame(0).get("transform", "translate");
	*/
  public get(time: string | number, ...args: NameType[]) {
    const frame = this.getFrame(time);

    return frame && frame.get(...args);
  }
  /**
	* remove properties to the sceneItem at that time
	* @param {Number} time - time
	* @param {...String|Object} [properties] - property names or values
	* @return {SceneItem} An instance itself
	* @example
item.remove(0, "a");
	*/
  public remove(time: number, ...args: NameType[]) {
    const frame = this.getFrame(time);

    frame && frame.remove(...args);
    this.update();
    return this;
  }
  /**
	* Append the item or object at the last time.
	* @param - the scene item or item object
	* @return An instance itself
	* @example
item.append(new SceneItem({
	0: {
		opacity: 0,
	},
	1: {
		opacity: 1,
	}
}));
item.append({
	0: {
		opacity: 0,
	},
	1: {
		opacity: 1,
	}
});
item.set(item.getDuration(), {
	0: {
		opacity: 0,
	},
	1: {
		opacity: 1,
	}
});
	*/
  public append(item: SceneItem | IObject<any>) {
    this.set(this.getDuration(), item);
    return this;
  }
  /**
	* Push the front frames for the time and prepend the scene item or item object.
	* @param - the scene item or item object
	* @return An instance itself
	*/
  public prepend(item: SceneItem | IObject<any>) {
    if (item instanceof SceneItem) {
      const delay = item.getDelay();
      const duration = item.getDuration();
      const unshiftTime = duration + delay;
      const firstFrame = this.keyframes.get(0);

      if (firstFrame) {
        this.keyframes.remove(0);
      }
      this.keyframes.unshift(unshiftTime);
      this.set(0, item);
      this.set(unshiftTime + THRESHOLD, firstFrame);
    } else {
      this.prepend(new SceneItem(item));
    }
    return this;
  }
  public toObject(isStartZero = true, startTime = 0) {
    const obj: IObject<Frame> = {};
    const keyframes = this.keyframes;
    const delay = this.getDelay();
    keyframes.forEach((frame: Frame, time: number) => {
      obj[(time === 0 && !isStartZero ? THRESHOLD : 0) + delay + startTime + time] = frame.clone();
    });
    return obj;
  }
  /**
	* Specifies an element to synchronize items' keyframes.
	* @param {string} selectors - Selectors to find elements in items.
	* @return {SceneItem} An instance itself
	* @example
item.setSelector("#id.class");
	*/
  public setSelector(selector: boolean | string) {
    const state = this.state;

    state.selector = selector === true ? state.id :
      (selector || `[data-scene-id="${state.id}"]`);

    const matches = /([\s\S]+)(:+[a-zA-Z]+)$/g.exec(state.selector);

    if (matches) {
      state.selector = matches[1];
      state.peusdo = matches[2];
    }
    IS_WINDOW && this.setElement(document.querySelectorAll(state.selector));
    return this;
  }
  /**
	* Specifies an element to synchronize item's keyframes.
	* @param {Element|Array|string} elements - elements to synchronize item's keyframes.
	* @return {SceneItem} An instance itself
	* @example
item.setElement(document.querySelector("#id.class"));
item.setElement(document.querySelectorAll(".class"));
	*/
  public setElement(elements: HTMLElement | ElementsType) {
    if (!elements) {
      return this;
    }
    this.elements = (elements instanceof Element) ? [elements] : elements;
    this.setId(this.getId());
    return this;
  }
  /**
	* add css styles of items's element to the frame at that time.
	* @param {Array} properties - elements to synchronize item's keyframes.
	* @return {SceneItem} An instance itself
	* @example
item.setElement(document.querySelector("#id.class"));
item.setCSS(0, ["opacity"]);
item.setCSS(0, ["opacity", "width", "height"]);
	*/
  public setCSS(time: number, properties: string[]) {
    this.set(time, fromCSS(this.elements, properties));
    return this;
  }
  public animate(time: number, parentEasing?: EasingType) {
    super.setTime(time, true);
    return this._animate(parentEasing);
  }
  public setTime(time: number | string, isNumber?: boolean, parentEasing?: EasingType) {
    super.setTime(time, isNumber);
    this._animate(parentEasing);
    return this;
  }
  /**
	* update property names used in frames.
	* @return {SceneItem} An instance itself
	* @example
item.update();
	*/
  public update() {
    this.keyframes.update();
    return this;
  }
  /**
	* update property names used in frame.
	* @param {Frame} [frame] - frame of that time.
	* @return {SceneItem} An instance itself
	* @example
item.updateFrame(time, this.get(time));
	*/
  public updateFrame(frame: Frame) {
    this.keyframes.updateFrame(frame);
    return this;
  }
  /**
	* Create and add a frame to the sceneItem at that time
	* @param {Number} time - frame's time
	* @return {Frame} Created frame.
	* @example
item.newFrame(time);
	*/
  public newFrame(time: string | number) {
    let frame = this.getFrame(time);

    if (frame) {
      return frame;
    }
    frame = new Frame();
    this.setFrame(time, frame);
    return frame;
  }
  /**
	* Add a frame to the sceneItem at that time
	* @param {Number} time - frame's time
	* @return {SceneItem} An instance itself
	* @example
item.setFrame(time, frame);
	*/
  public setFrame(time: string | number, frame: Frame) {
    this.keyframes.add(this.getUnitTime(time), frame);
    this.keyframes.update();
    return this;
  }
  /**
	* get sceneItem's frame at that time
	* @param {Number} time - frame's time
	* @return {Frame} sceneItem's frame at that time
	* @example
const frame = item.getFrame(time);
	*/
  public getFrame(time: number | string) {
    return this.keyframes.get(this.getUnitTime(time));
  }
  /**
	* check if the item has a frame at that time
	* @param {Number} time - frame's time
	* @return {Boolean} true: the item has a frame // false: not
	* @example
if (item.hasFrame(10)) {
	// has
} else {
	// not
}
	*/
  public hasFrame(time: number | string) {
    return this.keyframes.has(this.getUnitTime(time));
  }
  /**
	* remove sceneItem's frame at that time
	* @param {Number} time - frame's time
	* @return {SceneItem} An instance itself
	* @example
item.removeFrame(time);
	*/
  public removeFrame(time: number) {
    const keyframes = this.keyframes;

    keyframes.remove(time);
    keyframes.update();

    return this;
  }
  /**
	* Copy frame of the previous time at the next time.
	* @param {number|string|object} fromTime - the previous time
	* @param {number} toTime - the next time
	* @return {SceneItem} An instance itself
	* @example
// getFrame(0) equal getFrame(1)
item.copyFrame(0, 1);
	*/
  public copyFrame(fromTime: IObject<number> | number | string, toTime: number) {
    if (isObject(fromTime)) {
      for (const time in fromTime) {
        this.copyFrame(time, fromTime[time]);
      }
      return this;
    }
    const frame = this.getFrame(fromTime);

    if (!frame) {
      return this;
    }
    const copyFrame = frame.clone();

    this.setFrame(toTime, copyFrame);
    return this;
  }
  /**
	* merge frame of the previous time at the next time.
	* @param {number|string|object} fromTime - the previous time
	* @param {number|string} toTime - the next time
	* @return {SceneItem} An instance itself
	* @example
// getFrame(1) contains getFrame(0)
item.merge(0, 1);
	*/
  public mergeFrame(fromTime: IObject<number> | number | string, toTime: number | string) {
    if (isObject(fromTime)) {
      for (const time in fromTime) {
        this.mergeFrame(time, fromTime[time]);
      }
      return this;
    }
    const frame = this.getFrame(fromTime);

    if (!frame) {
      return this;
    }
    const toFrame = this.newFrame(toTime);

    toFrame.merge(frame);
    return this;
  }
  /**
	* Get frame of the current time
	* @param {Number} time - the current time
	* @param {function} easing - the speed curve of an animation
	* @return {Frame} frame of the current time
	* @example
let item = new SceneItem({
	0: {
		display: "none",
	},
	1: {
		display: "block",
		opacity: 0,
	},
	2: {
		opacity: 1,
	}
});
// opacity: 0.7; display:"block";
const frame = item.getNowFrame(1.7);
	*/
  public getNowFrame(time: number, easing?: EasingType) {
    const frame = new Frame();
    const names = this.keyframes.getNames();
    const { left, right } = this._getNearTimeIndex(time);
    const realEasing = this._getEasing(time, left, right, this.getEasing() || easing);

    names.forEach(properties => {
      const value = this._getNowValue(time, properties, left, right, realEasing);

      if (isUndefined(value)) {
        return;
      }
      frame.set(properties, value);
    });
    return frame;
  }
  public load(properties: any = {}, options = properties.options) {
    if (isArray(properties)) {
      const length = properties.length;

      for (let i = 0; i < length; ++i) {
        const time = length === 1 ? 0 : this.getUnitTime(`${i / (length - 1) * 100}%`);

        this.set(time, properties[i]);
      }
    } else if (properties.keyframes) {
      this.set(properties.keyframes);
    } else {
      for (const time in properties) {
        if (time === "options" || time === "keyframes") {
          continue;
        }
        const value = properties[time];
        const realTime = this.getUnitTime(time);

        if (typeof value === "number") {
          this.mergeFrame(value, realTime);
          continue;
        }
        this.set(realTime, value);
      }
    }
    options && this.setOptions(options);
    return this;
  }
  /**
	 * clone SceneItem.
	 * @param {IState} [options] animator options
	 * @return {SceneItem} An instance of clone
	 * @example
	 * item.clone();
	 */
  public clone(options = {}) {
    const item = new SceneItem();

    item.setOptions(this.state);
    item.setOptions(options);
    this.keyframes.forEach((frame: Frame, time: number) => item.setFrame(time, frame.clone()));
    return item;
  }
  public setOptions(options: IState = {}) {
    super.setOptions(options);
    const { id, selector, duration, elements } = options;

    duration && this.setDuration(duration);
    id && this.setId(id);
    if (elements) {
      this.setElement(elements);
    } else if (selector) {
      this.setSelector(selector === true ? this.state.id : selector);
    }
    return this;
  }
  public getAllTimes(options: IState = {}) {
    const times = this.keyframes.times.slice();
    let length = times.length;
    const keys: number[] = [];
    const values: IObject<number> = {};

    if (!length) {
      return { keys: [], values: {}, frames: {} };
    }
    const frames: IObject<Frame> = {};
    const duration = this.getDuration();
    const direction = options[DIRECTION] || this.state[DIRECTION];
    const isShuffle = direction === ALTERNATE || direction === ALTERNATE_REVERSE;
    (!this.getFrame(0)) && times.unshift(0);
    (!this.getFrame(duration)) && times.push(duration);
    length = times.length;
    let iterationCount = options[ITERATION_COUNT] || this.state[ITERATION_COUNT];

    iterationCount = iterationCount !== INFINITE ? iterationCount : 1;
    const totalDuration = iterationCount * duration;

    for (let i = 0; i < iterationCount; ++i) {
      const isReverse = isDirectionReverse(i, iterationCount, direction);
      const start = i * duration;

      for (let j = 0; j < length; ++j) {
        if (isShuffle && i !== 0 && j === 0) {
          // pass duplicate
          continue;
        }
        // isStartZero is keytimes[0] is 0 (i === 0 & j === 0)
        const threshold = j === 0 && (i > 0 && !isShuffle) ? THRESHOLD : 0;
        const keyvalue = toFixed(isReverse ? times[length - 1 - j] : times[j]);
        const time = toFixed(isReverse ? duration - keyvalue : keyvalue);
        const keytime = toFixed(start + time + threshold);

        if (totalDuration < keytime) {
          break;
        }
        keys.push(keytime);
        values[keytime] = keyvalue;

        if (!frames[keyvalue]) {
          const frame = this.getFrame(keyvalue);

          if (!frame || j === 0 || j === length - 1) {
            frames[keyvalue] = this.getNowFrame(keyvalue);
          } else {
            frames[keyvalue] = frame.clone();
            const isTransform = frame.has("transform");
            const isFilter = frame.has("filter");
            if (isTransform || isFilter) {
              const nowFrame = this.getNowFrame(keyvalue);

              isTransform && frames[keyvalue].remove("transform").set("transform", nowFrame.raw("transform"));
              isFilter && frames[keyvalue].remove("filter").set("filter", nowFrame.raw("filter"));
            }
          }
        }
      }
    }
    if (keys[keys.length - 1] < totalDuration) {
      // last time === totalDuration
      const isReverse = isDirectionReverse(iterationCount, iterationCount, direction);
      const keyvalue = toFixed(duration * (isReverse ? 1 - iterationCount % 1 : iterationCount % 1));

      keys.push(totalDuration);
      values[totalDuration] = keyvalue;
      !frames[keyvalue] && (frames[keyvalue] = this.getNowFrame(keyvalue));
    }
    return { keys, values, frames };
  }
  /**
	* Specifies an css text that coverted the keyframes of the item.
	* @param {Array} [duration=this.getDuration()] - elements to synchronize item's keyframes.
	* @param {Array} [options={}] - parent options to unify options of items.
	* @example
item.setCSS(0, ["opacity"]);
item.setCSS(0, ["opacity", "width", "height"]);
	*/
  public toCSS(parentDuration = this.getDuration(), options: IState = {}) {
    const state = this.state;
    const selector = state.selector || this.options.selector;
    if (!selector) {
      return "";
    }
    const peusdo = state.peusdo || "";
    const id = getRealId(this);
    // infinity or zero
    const isInfinite = state[ITERATION_COUNT] === INFINITE;
    const isParent = !isUndefined(options[ITERATION_COUNT]);
    const isZeroDuration = parentDuration === 0;
    const duration = isZeroDuration ? this.getDuration() : parentDuration;
    const playSpeed = (options[PLAY_SPEED] || 1);
    const delay = ((options[DELAY] || 0) + (isZeroDuration ? state[DELAY] : 0)) / playSpeed;
    const easingName = (state[EASING] && state[EASING_NAME]) ||
      (isParent && options[EASING] && options[EASING_NAME]) || state[EASING_NAME];
    const iterationCount = isInfinite ? INFINITE :
      (!isZeroDuration && options[ITERATION_COUNT]) || state[ITERATION_COUNT];
    const fillMode = (options[FILL_MODE] !== "forwards" && options[FILL_MODE]) || state[FILL_MODE];
    const direction = isInfinite ? state[DIRECTION] : options[DIRECTION] || state[DIRECTION];
    const cssText = makeAnimationProperties({
      fillMode,
      direction,
      iterationCount,
      delay: `${delay}s`,
      name: `${PREFIX}KEYFRAMES_${toId(id)}`,
      duration: `${duration / playSpeed}s`,
      timingFunction: easingName,
    });

    const css = `${selector}.${START_ANIMATION}${peusdo} {
			${cssText}
		}${selector}.${PAUSE_ANIMATION}${peusdo} {
      ${ANIMATION}-play-state: paused;
    }
		${this._toKeyframes(duration, !isZeroDuration && isParent)}`;

    return css;
  }
  public exportCSS(duration?: number, options?: IState) {
    if (!this.elements.length) {
      return "";
    }
    const css = this.toCSS(duration, options);
    const isParent = options && !isUndefined(options[ITERATION_COUNT]);

    !isParent && exportCSS(getRealId(this), css);
    return css;
  }
  public pause() {
    super.pause();
    this.isPausedCSS() && this.pauseCSS();
    return this;
  }
  public isPausedCSS() {
    return this.state.playCSS && this.isPaused();
  }
  public pauseCSS() {
    const elements = this.elements;
    const length = elements.length;

    if (!length) {
      return this;
    }
    for (let i = 0; i < length; ++i) {
      addClass(elements[i], PAUSE_ANIMATION);
    }
  }
  public endCSS() {
    const elements = this.elements;
    const length = elements.length;

    if (!length) {
      return this;
    }
    for (let i = 0; i < length; ++i) {
      const element = elements[i];

      removeClass(element, PAUSE_ANIMATION);
      removeClass(element, START_ANIMATION);
    }
    this.setState({ playCSS: false });
  }
  public end() {
    !this.isEnded() && this.state.playCSS && this.endCSS();
    super.end();
    return this;
  }
  /**
	* Play using the css animation and keyframes.
	* @param {boolean} [exportCSS=true] Check if you want to export css.
	* @param {Object} [properties={}] The shorthand properties for six of the animation properties.
	* @param {Object} [properties.duration] The duration property defines how long an animation should take to complete one cycle.
	* @param {Object} [properties.fillMode] The fillMode property specifies a style for the element when the animation is not playing (before it starts, after it ends, or both).
	* @param {Object} [properties.iterationCount] The iterationCount property specifies the number of times an animation should be played.
	* @param {String} [properties.easing] The easing(timing-function) specifies the speed curve of an animation.
	* @param {Object} [properties.delay] The delay property specifies a delay for the start of an animation.
	* @param {Object} [properties.direction] The direction property defines whether an animation should be played forwards, backwards or in alternate cycles.
	* @see {@link https://www.w3schools.com/cssref/css3_pr_animation.asp}
	* @example
item.playCSS();
item.playCSS(false, {
	direction: "reverse",
	fillMode: "forwards",
});
	*/
  public playCSS(isExportCSS = true, properties = {}) {
    playCSS(this, isExportCSS, properties);
    return this;
  }
  public addPlayClass(isPaused: boolean, properties = {}) {
    const elements = this.elements;
    const length = elements.length;
    const cssText = makeAnimationProperties(properties);

    if (!length) {
      return;
    }
    if (isPaused) {
      for (let i = 0; i < length; ++i) {
        removeClass(elements[i], PAUSE_ANIMATION);
      }
    } else {
      for (let i = 0; i < length; ++i) {
        const element = elements[i];

        element.style.cssText += cssText;
        if (hasClass(element, START_ANIMATION)) {
          removeClass(element, START_ANIMATION);
          (el => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                addClass(el, START_ANIMATION);
              });
            });
          })(element);
        } else {
          addClass(element, START_ANIMATION);
        }
      }
    }
    return elements[0];
  }
  private _getEasing(time: number, left: number, right: number, easing: EasingType) {
    if (this.keyframes.hasName(TIMING_FUNCTION)) {
      const nowEasing = this._getNowValue(time, [TIMING_FUNCTION], left, right, 0, true);

      return isFunction(nowEasing) ? nowEasing : easing;
    }
    return easing;
  }
  private _toKeyframes(duration = this.getDuration(), isParent: boolean) {
    const id = getRealId(this);
    const state = this.state;
    const playSpeed = state[PLAY_SPEED];
    const iterationCount = state[ITERATION_COUNT];
    const fillMode = state[FILL_MODE];
    const delay = isParent ? state[DELAY] : 0;
    const direction = isParent ? state[DIRECTION] : NORMAL;
    const isReverse = direction === REVERSE || direction === ALTERNATE_REVERSE;
    const { keys, values, frames } = this.getAllTimes({
      duration,
      delay,
      direction,
      iterationCount: isParent && iterationCount !== INFINITE ? iterationCount : 1,
      isCSS: true,
    });
    const length = keys.length;
    const css: IObject<string> = {};
    const keyframes: string[] = [];

    if (!keys.length) {
      return "";
    }
    for (const time in frames) {
      css[time] = frames[time].toCSS();
    }
    const lastTime = keys[length - 1];
    const lastCSS = css[values[lastTime]];

    if (delay) {
      const delayCSS = isReverse && (fillMode === "both" || fillMode === "backwards") ? lastCSS : css[0];
      keyframes.push(`0%{}`);
      isReverse && keyframes.push(`${delay / playSpeed / duration * 100 - THRESHOLD}%{${delayCSS}}`);
    }
    keys.forEach(time => {
      const keyTime = (delay + time) / playSpeed / duration * 100;
      keyframes.push(`${keyTime}%{${keyTime === 0 ? "" : css[values[time]]}}`);
    });
    // if (afterDelay) {
    //   keyframes.push(`${lastTime / playSpeed / duration * 100 + THRESHOLD}%{${lastCSS}}`);
    //   keyframes.push(`100%{${lastCSS}`);
    // } else {
    if ((delay + lastTime) / playSpeed < duration) {
      // not 100%
      keyframes.push(`100%{${lastCSS}}`);
    }
    // }
    return `@${KEYFRAMES} ${PREFIX}KEYFRAMES_${toId(id)}{
			${keyframes.join("\n")}
		}`;
  }
  private _getNowValue(
    time: number,
    properties: string[],
    left: number,
    right: number,
    easing: EasingType = this.getEasing(),
    usePrevValue: boolean = isFixed(properties),
  ) {
    const keyframes = this.keyframes;
    const times = keyframes.times;
    const length = times.length;

    let prevTime: number;
    let nextTime: number;
    let prevFrame: Frame;
    let nextFrame: Frame;

    for (let i = left; i >= 0; --i) {
      const frame = keyframes.get(times[i]);

      if (frame.has(...properties)) {
        prevTime = times[i];
        prevFrame = frame;
        break;
      }
    }
    const prevValue = prevFrame && prevFrame.raw(...properties);

    if (usePrevValue) {
      return prevValue;
    }
    for (let i = right; i < length; ++i) {
      const frame = keyframes.get(times[i]);

      if (frame.has(...properties)) {
        nextTime = times[i];
        nextFrame = frame;
        break;
      }
    }
    const nextValue = nextFrame && nextFrame.raw(...properties);

    if (!prevFrame || isUndefined(prevValue)) {
      return nextValue;
    }
    if (!nextFrame || isUndefined(nextValue) || prevValue === nextValue) {
      return prevValue;
    }
    if (prevTime < 0) {
      prevTime = 0;
    }
    return dotValue(time, prevTime, nextTime, prevValue, nextValue, easing);
  }
  private _getNearTimeIndex(time: number) {
    const keyframes = this.keyframes;
    const times = keyframes.times;
    const length = times.length;

    for (let i = 0; i < length; ++i) {
      if (times[i] === time) {
        return { left: i, right: i };
      } else if (times[i] > time) {
        return { left: i === 0 ? 0 : i - 1, right: i };
      }
    }
    return { left: length - 1, right: length - 1 };
  }
  private _animate(parentEasing?: EasingType) {
    const iterationTime = this.getIterationTime();
    const easing = this.getEasing() || parentEasing;
    const frame = this.getNowFrame(iterationTime, easing);
    const currentTime = this.getTime();

    /**
		 * This event is fired when timeupdate and animate.
		 * @event SceneItem#animate
		 * @param {Number} param.currentTime The total time that the animator is running.
		 * @param {Number} param.time The iteration time during duration that the animator is running.
		 * @param {Frame} param.frame frame of that time.
		 */
    this.trigger("animate", {
      frame,
      currentTime,
      time: iterationTime,
    });
    const elements = this.elements;
    const length = elements.length;

    if (!length || this.state.peusdo) {
      return frame;
    }
    const attributes = frame.get("attribute");

    if (attributes) {
      for (const name in (attributes as any)) {
        for (let i = 0; i < length; ++i) {
          elements[i].setAttribute(name, attributes[name]);
        }
      }
    }
    const cssText = frame.toCSS();

    if (this.state.cssText !== cssText) {
      this.state.cssText = cssText;

      for (let i = 0; i < length; ++i) {
        elements[i].style.cssText += cssText;
      }
      return frame;
    }
  }
}

export default SceneItem;
