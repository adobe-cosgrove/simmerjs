import initQueryEngine, { wrap } from './queryEngine'
import parsingMethods from './methods'
import validateSelector from './validateSelector'
import convertSelectorStateIntoCSSSelector from './convertSelectorStateIntoCSSSelector'
import Parser from './parser'
import stackHierarchy from './stackHierarchy'
import { configure } from './configuration'

export default function createSimmer (
  windowScope = window,
  config = configure(),
  query = initQueryEngine(windowScope, config.queryEngine)
) {
  /**
     * Handle errors in accordance with what is specified in the configuration
     * @param {object/string} ex. The exception object or message
     * @param {object} element. The element Simmer was asked to process
     */
  function onError (ex, element) {
    // handle error
    if (config.errorHandling === true) {
      throw ex
    }
    if (typeof config.errorHandling === 'function') {
      config.errorHandling(ex, element)
    }
  }

  // Initialize the Simmer object and set it over the reference on the window
  /**
   * The main Simmer action - parses an element on the page to produce a CSS selector for it.
   * This function will be returned into the global Simmer object.
   * @param {object} element. A DOM element you wish to create a selector for.
   * @example
   <code><pre>
   var cssSelectorForDonJulio = Simmer(document.getElementByID('DonJulio'));
   </pre></code>
   */
  const simmer = function (element) {
    if (!element) {
      // handle error
      onError.call(
        simmer,
        new Error('Simmer: No element was specified for parsing.'),
        element
      )
      return false
    }

    // The parser cycles through a set of parsing methods specified in an order optimal
    // for creating as specific as possible a selector
    const parser = new Parser(parsingMethods)

    // get the element's ancestors
    const hierarchy = stackHierarchy(wrap(element), config.depth)

    // initialize the state of the selector
    let selectorState = {
      // the stack is used to build a layer of selectors, each layer coresponding to a specific element in the heirarchy
      stack: [],
      // follow the current specificity level of the selector - the higher the better
      specificity: 0
    }

    // for each level we create a private stack of properties, so that we can then merge them
    // comfortably and allow all methods to see the level at which existing properties have
    // been set
    for (let index = 0; index < hierarchy.length; index += 1) {
      selectorState.stack[index] = []
    }
    // cycle through the available parsing methods and while we still have yet to find the requested element's one-to-one selector
    // we keep calling the methods until we are either satisfied or run out of methods
    while (!parser.finished() && !selectorState.verified) {
      try {
        selectorState = parser.next(
          hierarchy,
          selectorState,
          config,
          validateSelector,
          query,
          onError
        )

        // if we have reached a satisfactory level of specificity, try the selector, perhaps we have found our selector?
        if (
          selectorState.specificity >= config.specificityThreshold &&
          !selectorState.verified
        ) {
          selectorState.verified = validateSelector(
            element,
            selectorState,
            config.selectorMaxLength,
            query,
            onError
          )
        }
      } catch (ex) {
        // handle error
        onError.call(simmer, ex, element)
      }
    }

    // if we were not able to produce a one-to-one selector, return false
    if (
      selectorState.verified === undefined ||
      selectorState.specificity < config.specificityThreshold
    ) {
      // if it is undefined then verfication has never been run!
      // try and verify, and if verification fails - return false
      // if it is false and the specificity is too low to actually try and find the element in the first place, then we may simply have not run
      // an up to date verification - try again
      selectorState.verified = validateSelector(
        element,
        selectorState,
        config.selectorMaxLength,
        query,
        onError
      )
    }

    if (!selectorState.verified) {
      return false
    }

    if (selectorState.verificationDepth) {
      return convertSelectorStateIntoCSSSelector(
        selectorState,
        selectorState.verificationDepth
      )
    }
    return convertSelectorStateIntoCSSSelector(selectorState)
  }

  /**
   * Get/Set the configuration for the Simmer object
   * @param config (Object) A configuration object with any of the properties tweeked (none/depth/minimumSpecificity)
   * @example
   <code><pre>
   configuration({
            depth: 3
         });
   </pre></code>
   */
  simmer.configure = function (configValues = {}, scope = windowScope) {
    const newConfig = configure({
      ...config,
      ...configValues
    })
    return createSimmer(
      scope,
      initQueryEngine(scope, newConfig.queryEngine),
      newConfig
    )
  }

  return simmer
}
