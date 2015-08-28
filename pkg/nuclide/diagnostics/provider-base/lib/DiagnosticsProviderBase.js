'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import type {TextEventDispatcher} from 'nuclide-text-event-dispatcher';

type ProviderBaseOptions = {
  onTextEditorEvent?: (editor: TextEditor) => mixed;
  onNewUpdateSubscriber?: (callback: MessageUpdateCallback) => mixed;
  onNewInvalidateSubscriber?: (callback: MessageInvalidationCallback) => mixed;
  // If true, this will cause onTextEditorEvent to get called more often --
  // approximately whenever the user stops typing. If false, it will get called
  // only when the user saves.
  shouldRunOnTheFly?: boolean;
  // If grammarScopes is not specified, enableForAllGrammars must be true. If
  // grammarScopes is specified and enableForAllGrammars is true,
  // enableForAllGrammars takes precedence.
  grammarScopes?: Set<string>;
  enableForAllGrammars?: boolean;
}

var UPDATE_EVENT = 'update';
var INVALIDATE_EVENT = 'invalidate';

var {CompositeDisposable, Emitter} = require('atom');

function getTextEventDispatcher() {
  return require('nuclide-text-event-dispatcher').getInstance();
}

class DiagnosticsProviderBase {
  _textEventDispatcher: TextEventDispatcher;

  _emitter: Emitter;

  _grammarScopes: Set<string>;
  _allGrammarScopes: ?boolean;

  _currentEventSubscription: ?atom$Disposable;

  _disposables: atom$CompositeDisposable;

  // callbacks provided by client
  _textEventCallback: (editor: TextEditor) => mixed;
  _newUpdateSubscriberCallback: (callback: MessageUpdateCallback) => mixed;
  _newInvalidateSubscriberCallback: (callback: MessageInvalidationCallback) => mixed;

  constructor(options: ProviderBaseOptions, textEventDispatcher?: TextEventDispatcher = getTextEventDispatcher()) {
    this._textEventDispatcher = textEventDispatcher;
    this._emitter = new Emitter();
    this._disposables = new CompositeDisposable();

    this._textEventCallback = callbackOrNoop(options.onTextEditorEvent);
    this._newUpdateSubscriberCallback = callbackOrNoop(options.onNewUpdateSubscriber);
    this._newInvalidateSubscriberCallback = callbackOrNoop(options.onNewInvalidateSubscriber);

    // The Set constructor creates an empty Set if passed null or undefined.
    this._grammarScopes = new Set(options.grammarScopes);
    this._allGrammarScopes = !!options.enableForAllGrammars;
    this._subscribeToTextEditorEvent(!!options.shouldRunOnTheFly);
  }

  /**
   * Subscribes to the appropriate event depending on whether we should run on
   * the fly or not.
   */
  _subscribeToTextEditorEvent(shouldRunOnTheFly: boolean) {
    this._disposeEventSubscription();
    var dispatcher = this._textEventDispatcher;
    var subscription;
    if (shouldRunOnTheFly) {
      if (this._allGrammarScopes) {
        subscription = dispatcher.onAnyFileChange(this._textEventCallback);
      } else {
        subscription = dispatcher.onFileChange(this._grammarScopes, this._textEventCallback);
      }
    } else {
      if (this._allGrammarScopes) {
        subscription = dispatcher.onAnyFileSave(this._textEventCallback);
      } else {
        subscription = dispatcher.onFileSave(this._grammarScopes, this._textEventCallback);
      }
    }
    this._currentEventSubscription = subscription;
  }

  setRunOnTheFly(runOnTheFly: boolean) {
    this._subscribeToTextEditorEvent(runOnTheFly);
  }

  dispose(): void {
    this._emitter.dispose();
    this._disposables.dispose();
    this._disposeEventSubscription();
  }

  _disposeEventSubscription(): void {
    if (this._currentEventSubscription) {
      this._currentEventSubscription.dispose();
      this._currentEventSubscription = null;
    }
  }

  /**
   * Clients can call these methods to publish messages
   */

  publishMessageUpdate(update: DiagnosticProviderUpdate): void {
    this._emitter.emit(UPDATE_EVENT, update);
  }

  publishMessageInvalidation(message: InvalidationMessage): void {
    this._emitter.emit(INVALIDATE_EVENT, message);
  }

  /**
   * Clients should delegate to these
   */

  onMessageUpdate(callback: MessageUpdateCallback): atom$Disposable {
    var disposable = this._emitter.on(UPDATE_EVENT, callback);
    this._newUpdateSubscriberCallback(callback);
    return disposable;
  }

  onMessageInvalidation(callback: MessageInvalidationCallback): atom$Disposable {
    var disposable = this._emitter.on(INVALIDATE_EVENT, callback);
    this._newInvalidateSubscriberCallback(callback);
    return disposable;
  }
}

function callbackOrNoop<T>(callback: ?(arg: T) => mixed): (arg: T) => mixed {
  return callback ? callback.bind(undefined) : () => { };
}

module.exports = DiagnosticsProviderBase;