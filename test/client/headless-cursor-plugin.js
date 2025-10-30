/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
import * as Y from 'yjs';
import { AllSelection, Plugin } from 'prosemirror-state';
import {
  absolutePositionToRelativePosition,
  yCursorPluginKey, ySyncPluginKey,
} from 'y-prosemirror';

/**
 * A prosemirror plugin that listens to awareness information on Yjs.
 * This requires that a `prosemirrorPlugin` is also bound to the prosemirror.
 * It updates the awareness when the prosemirror selection changes.
 *
 * @public
 * @param {Awareness} awareness
 * @return {any}
 */
export function yHeadlessCursorPlugin(awareness) {
  return new Plugin({
    key: yCursorPluginKey,
    state: {
      init() {
        return {};
      },
      apply() {
        return {};
      },
    },
    view: (view) => {
      const updateCursorInfo = () => {
        const ystate = ySyncPluginKey.getState(view.state);
        // @note We make implicit checks when checking for the cursor property
        const current = awareness.getLocalState() || {};
        const { selection } = view.state;
        // the test doesn't use the all selection so we suppress it here.
        // due to some raise condition, the initial selection in the state
        // is the AllSelection until a doc is loaded.
        if (selection instanceof AllSelection) {
          return;
        }

        /**
         * @type {Y.RelativePosition}
         */
        const anchor = absolutePositionToRelativePosition(
          selection.anchor,
          ystate.type,
          ystate.binding.mapping,
        );
        /**
         * @type {Y.RelativePosition}
         */
        const head = absolutePositionToRelativePosition(
          selection.head,
          ystate.type,
          ystate.binding.mapping,
        );
        if (
          current.cursor == null
          || !Y.compareRelativePositions(
            Y.createRelativePositionFromJSON(current.cursor.anchor),
            anchor,
          )
          || !Y.compareRelativePositions(
            Y.createRelativePositionFromJSON(current.cursor.head),
            head,
          )
        ) {
          awareness.setLocalStateField('cursor', {
            anchor,
            head,
          });
        }
      };
      return {
        update: updateCursorInfo,
        destroy: () => {
          awareness.setLocalStateField('cursor', null);
        },
      };
    },
  });
}
