import { addInit, addOnDidChange, getChangePropName, PROPS } from "./common";
import { PgCommon } from "../common";
import type {
  Initable,
  OnDidChangeDefault,
  OnDidChangeProperty,
} from "./types";
import type { Disposable } from "../types";

/**
 * Make the given static class derivable.
 *
 * This decorator defines properties from the given state keys and they will be
 * updated based on the given `onChange` event(s).
 *
 * The properties are read-only and the only way to update the values is
 * to trigger the given `onChange` method(s).
 */
export function derivable<T extends Derivable>(
  deriveState: () => { [key: string]: T }
) {
  return (sClass: any) => {
    // Add `init` method
    addInit(sClass, () => {
      const state = deriveState();

      // Add `onDidChange` methods
      addOnDidChange(sClass, state);

      const disposables: Disposable[] = [];
      for (const prop in state) {
        // Define getter
        if (!Object.hasOwn(sClass, prop)) {
          Object.defineProperty(sClass, prop, {
            get: () => sClass[PROPS.INTERNAL_STATE][prop],
          });
        }

        const derivable = state[prop];
        derivable.onChange = PgCommon.toArray(derivable.onChange);
        derivable.onChange = derivable.onChange.map((onChange) => {
          if (typeof onChange === "string") {
            return sClass[getChangePropName(onChange)];
          }

          return onChange;
        });

        const disposable = PgCommon.batchChanges(async (value) => {
          sClass[PROPS.INTERNAL_STATE][prop] = await derivable.derive(value);
          sClass[PROPS.DISPATCH_CHANGE_EVENT](prop);
        }, derivable.onChange as Exclude<OnChange, string>[]);

        disposables.push(disposable);
      }

      return {
        dispose: () => disposables.forEach(({ dispose }) => dispose()),
      };
    });
  };
}

/** Either `onChange` method or a string that will be checked from the state */
type OnChange<T = unknown> = ((cb: (value?: T) => void) => Disposable) | string;

/** Derivable property declaration */
type Derivable<T = any, R = unknown> = {
  /** The method that the value will be derived from. */
  derive: (value: T) => R;
  /** Derive method will be called whenever there is a change. */
  onChange: OnChange<T> | OnChange[];
};

/** Derivable state properties */
type DerivableState<T> = {
  readonly // eslint-disable-next-line @typescript-eslint/no-unused-vars
  [K in keyof T]: T[K] extends Derivable<infer _, infer R> ? Awaited<R> : never;
};

/**
 * Create a derivable.
 *
 * This function is a type helper function.
 */
export const createDerivable = <T, R>(derivable: Derivable<T, R>) => derivable;

/**
 * Add necessary types to the given derivable static class.
 *
 * @param sClass static class
 * @param derive derive properties that will be added to the given class
 * @returns the static class with correct types
 */
export const declareDerivable = <C, T>(sClass: C, derive: () => T) => {
  return sClass as Omit<C, "prototype"> &
    Initable &
    DerivableState<T> &
    OnDidChangeDefault<DerivableState<T>> &
    OnDidChangeProperty<DerivableState<T>>;
};
