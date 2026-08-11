;(function () {
  const l = document.createElement('link').relList
  if (l && l.supports && l.supports('modulepreload')) return
  for (const c of document.querySelectorAll('link[rel="modulepreload"]')) u(c)
  new MutationObserver((c) => {
    for (const f of c)
      if (f.type === 'childList')
        for (const d of f.addedNodes) d.tagName === 'LINK' && d.rel === 'modulepreload' && u(d)
  }).observe(document, { childList: !0, subtree: !0 })
  function a(c) {
    const f = {}
    return (
      c.integrity && (f.integrity = c.integrity),
      c.referrerPolicy && (f.referrerPolicy = c.referrerPolicy),
      c.crossOrigin === 'use-credentials'
        ? (f.credentials = 'include')
        : c.crossOrigin === 'anonymous'
          ? (f.credentials = 'omit')
          : (f.credentials = 'same-origin'),
      f
    )
  }
  function u(c) {
    if (c.ep) return
    c.ep = !0
    const f = a(c)
    fetch(c.href, f)
  }
})()
var Sf = { exports: {} },
  Yi = {}
/**
 * @license React
 * react-jsx-runtime.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */ var xy
function L0() {
  if (xy) return Yi
  xy = 1
  var s = Symbol.for('react.transitional.element'),
    l = Symbol.for('react.fragment')
  function a(u, c, f) {
    var d = null
    if ((f !== void 0 && (d = '' + f), c.key !== void 0 && (d = '' + c.key), 'key' in c)) {
      f = {}
      for (var m in c) m !== 'key' && (f[m] = c[m])
    } else f = c
    return ((c = f.ref), { $$typeof: s, type: u, key: d, ref: c !== void 0 ? c : null, props: f })
  }
  return ((Yi.Fragment = l), (Yi.jsx = a), (Yi.jsxs = a), Yi)
}
var Ey
function R0() {
  return (Ey || ((Ey = 1), (Sf.exports = L0())), Sf.exports)
}
var y = R0(),
  _f = { exports: {} },
  oe = {}
/**
 * @license React
 * react.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */ var Ay
function U0() {
  if (Ay) return oe
  Ay = 1
  var s = Symbol.for('react.transitional.element'),
    l = Symbol.for('react.portal'),
    a = Symbol.for('react.fragment'),
    u = Symbol.for('react.strict_mode'),
    c = Symbol.for('react.profiler'),
    f = Symbol.for('react.consumer'),
    d = Symbol.for('react.context'),
    m = Symbol.for('react.forward_ref'),
    g = Symbol.for('react.suspense'),
    p = Symbol.for('react.memo'),
    _ = Symbol.for('react.lazy'),
    S = Symbol.for('react.activity'),
    O = Symbol.iterator
  function E(N) {
    return N === null || typeof N != 'object'
      ? null
      : ((N = (O && N[O]) || N['@@iterator']), typeof N == 'function' ? N : null)
  }
  var U = {
      isMounted: function () {
        return !1
      },
      enqueueForceUpdate: function () {},
      enqueueReplaceState: function () {},
      enqueueSetState: function () {},
    },
    A = Object.assign,
    M = {}
  function K(N, B, J) {
    ;((this.props = N), (this.context = B), (this.refs = M), (this.updater = J || U))
  }
  ;((K.prototype.isReactComponent = {}),
    (K.prototype.setState = function (N, B) {
      if (typeof N != 'object' && typeof N != 'function' && N != null)
        throw Error(
          'takes an object of state variables to update or a function which returns an object of state variables.'
        )
      this.updater.enqueueSetState(this, N, B, 'setState')
    }),
    (K.prototype.forceUpdate = function (N) {
      this.updater.enqueueForceUpdate(this, N, 'forceUpdate')
    }))
  function Z() {}
  Z.prototype = K.prototype
  function I(N, B, J) {
    ;((this.props = N), (this.context = B), (this.refs = M), (this.updater = J || U))
  }
  var Y = (I.prototype = new Z())
  ;((Y.constructor = I), A(Y, K.prototype), (Y.isPureReactComponent = !0))
  var L = Array.isArray
  function $() {}
  var X = { H: null, A: null, T: null, S: null },
    G = Object.prototype.hasOwnProperty
  function ce(N, B, J) {
    var ne = J.ref
    return { $$typeof: s, type: N, key: B, ref: ne !== void 0 ? ne : null, props: J }
  }
  function We(N, B) {
    return ce(N.type, B, N.props)
  }
  function Ke(N) {
    return typeof N == 'object' && N !== null && N.$$typeof === s
  }
  function F(N) {
    var B = { '=': '=0', ':': '=2' }
    return (
      '$' +
      N.replace(/[=:]/g, function (J) {
        return B[J]
      })
    )
  }
  var Me = /\/+/g
  function At(N, B) {
    return typeof N == 'object' && N !== null && N.key != null ? F('' + N.key) : B.toString(36)
  }
  function Ot(N) {
    switch (N.status) {
      case 'fulfilled':
        return N.value
      case 'rejected':
        throw N.reason
      default:
        switch (
          (typeof N.status == 'string'
            ? N.then($, $)
            : ((N.status = 'pending'),
              N.then(
                function (B) {
                  N.status === 'pending' && ((N.status = 'fulfilled'), (N.value = B))
                },
                function (B) {
                  N.status === 'pending' && ((N.status = 'rejected'), (N.reason = B))
                }
              )),
          N.status)
        ) {
          case 'fulfilled':
            return N.value
          case 'rejected':
            throw N.reason
        }
    }
    throw N
  }
  function z(N, B, J, ne, he) {
    var ve = typeof N
    ;(ve === 'undefined' || ve === 'boolean') && (N = null)
    var we = !1
    if (N === null) we = !0
    else
      switch (ve) {
        case 'bigint':
        case 'string':
        case 'number':
          we = !0
          break
        case 'object':
          switch (N.$$typeof) {
            case s:
            case l:
              we = !0
              break
            case _:
              return ((we = N._init), z(we(N._payload), B, J, ne, he))
          }
      }
    if (we)
      return (
        (he = he(N)),
        (we = ne === '' ? '.' + At(N, 0) : ne),
        L(he)
          ? ((J = ''),
            we != null && (J = we.replace(Me, '$&/') + '/'),
            z(he, B, J, '', function (Xa) {
              return Xa
            }))
          : he != null &&
            (Ke(he) &&
              (he = We(
                he,
                J + (he.key == null || (N && N.key === he.key) ? '' : ('' + he.key).replace(Me, '$&/') + '/') + we
              )),
            B.push(he)),
        1
      )
    we = 0
    var ht = ne === '' ? '.' : ne + ':'
    if (L(N)) for (var Xe = 0; Xe < N.length; Xe++) ((ne = N[Xe]), (ve = ht + At(ne, Xe)), (we += z(ne, B, J, ve, he)))
    else if (((Xe = E(N)), typeof Xe == 'function'))
      for (N = Xe.call(N), Xe = 0; !(ne = N.next()).done; )
        ((ne = ne.value), (ve = ht + At(ne, Xe++)), (we += z(ne, B, J, ve, he)))
    else if (ve === 'object') {
      if (typeof N.then == 'function') return z(Ot(N), B, J, ne, he)
      throw (
        (B = String(N)),
        Error(
          'Objects are not valid as a React child (found: ' +
            (B === '[object Object]' ? 'object with keys {' + Object.keys(N).join(', ') + '}' : B) +
            '). If you meant to render a collection of children, use an array instead.'
        )
      )
    }
    return we
  }
  function Q(N, B, J) {
    if (N == null) return N
    var ne = [],
      he = 0
    return (
      z(N, ne, '', '', function (ve) {
        return B.call(J, ve, he++)
      }),
      ne
    )
  }
  function H(N) {
    if (N._status === -1) {
      var B = N._result
      ;((B = B()),
        B.then(
          function (J) {
            ;(N._status === 0 || N._status === -1) && ((N._status = 1), (N._result = J))
          },
          function (J) {
            ;(N._status === 0 || N._status === -1) && ((N._status = 2), (N._result = J))
          }
        ),
        N._status === -1 && ((N._status = 0), (N._result = B)))
    }
    if (N._status === 1) return N._result.default
    throw N._result
  }
  var ie =
      typeof reportError == 'function'
        ? reportError
        : function (N) {
            if (typeof window == 'object' && typeof window.ErrorEvent == 'function') {
              var B = new window.ErrorEvent('error', {
                bubbles: !0,
                cancelable: !0,
                message:
                  typeof N == 'object' && N !== null && typeof N.message == 'string' ? String(N.message) : String(N),
                error: N,
              })
              if (!window.dispatchEvent(B)) return
            } else if (typeof process == 'object' && typeof process.emit == 'function') {
              process.emit('uncaughtException', N)
              return
            }
            console.error(N)
          },
    ge = {
      map: Q,
      forEach: function (N, B, J) {
        Q(
          N,
          function () {
            B.apply(this, arguments)
          },
          J
        )
      },
      count: function (N) {
        var B = 0
        return (
          Q(N, function () {
            B++
          }),
          B
        )
      },
      toArray: function (N) {
        return (
          Q(N, function (B) {
            return B
          }) || []
        )
      },
      only: function (N) {
        if (!Ke(N)) throw Error('React.Children.only expected to receive a single React element child.')
        return N
      },
    }
  return (
    (oe.Activity = S),
    (oe.Children = ge),
    (oe.Component = K),
    (oe.Fragment = a),
    (oe.Profiler = c),
    (oe.PureComponent = I),
    (oe.StrictMode = u),
    (oe.Suspense = g),
    (oe.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = X),
    (oe.__COMPILER_RUNTIME = {
      __proto__: null,
      c: function (N) {
        return X.H.useMemoCache(N)
      },
    }),
    (oe.cache = function (N) {
      return function () {
        return N.apply(null, arguments)
      }
    }),
    (oe.cacheSignal = function () {
      return null
    }),
    (oe.cloneElement = function (N, B, J) {
      if (N == null) throw Error('The argument must be a React element, but you passed ' + N + '.')
      var ne = A({}, N.props),
        he = N.key
      if (B != null)
        for (ve in (B.key !== void 0 && (he = '' + B.key), B))
          !G.call(B, ve) ||
            ve === 'key' ||
            ve === '__self' ||
            ve === '__source' ||
            (ve === 'ref' && B.ref === void 0) ||
            (ne[ve] = B[ve])
      var ve = arguments.length - 2
      if (ve === 1) ne.children = J
      else if (1 < ve) {
        for (var we = Array(ve), ht = 0; ht < ve; ht++) we[ht] = arguments[ht + 2]
        ne.children = we
      }
      return ce(N.type, he, ne)
    }),
    (oe.createContext = function (N) {
      return (
        (N = { $$typeof: d, _currentValue: N, _currentValue2: N, _threadCount: 0, Provider: null, Consumer: null }),
        (N.Provider = N),
        (N.Consumer = { $$typeof: f, _context: N }),
        N
      )
    }),
    (oe.createElement = function (N, B, J) {
      var ne,
        he = {},
        ve = null
      if (B != null)
        for (ne in (B.key !== void 0 && (ve = '' + B.key), B))
          G.call(B, ne) && ne !== 'key' && ne !== '__self' && ne !== '__source' && (he[ne] = B[ne])
      var we = arguments.length - 2
      if (we === 1) he.children = J
      else if (1 < we) {
        for (var ht = Array(we), Xe = 0; Xe < we; Xe++) ht[Xe] = arguments[Xe + 2]
        he.children = ht
      }
      if (N && N.defaultProps) for (ne in ((we = N.defaultProps), we)) he[ne] === void 0 && (he[ne] = we[ne])
      return ce(N, ve, he)
    }),
    (oe.createRef = function () {
      return { current: null }
    }),
    (oe.forwardRef = function (N) {
      return { $$typeof: m, render: N }
    }),
    (oe.isValidElement = Ke),
    (oe.lazy = function (N) {
      return { $$typeof: _, _payload: { _status: -1, _result: N }, _init: H }
    }),
    (oe.memo = function (N, B) {
      return { $$typeof: p, type: N, compare: B === void 0 ? null : B }
    }),
    (oe.startTransition = function (N) {
      var B = X.T,
        J = {}
      X.T = J
      try {
        var ne = N(),
          he = X.S
        ;(he !== null && he(J, ne),
          typeof ne == 'object' && ne !== null && typeof ne.then == 'function' && ne.then($, ie))
      } catch (ve) {
        ie(ve)
      } finally {
        ;(B !== null && J.types !== null && (B.types = J.types), (X.T = B))
      }
    }),
    (oe.unstable_useCacheRefresh = function () {
      return X.H.useCacheRefresh()
    }),
    (oe.use = function (N) {
      return X.H.use(N)
    }),
    (oe.useActionState = function (N, B, J) {
      return X.H.useActionState(N, B, J)
    }),
    (oe.useCallback = function (N, B) {
      return X.H.useCallback(N, B)
    }),
    (oe.useContext = function (N) {
      return X.H.useContext(N)
    }),
    (oe.useDebugValue = function () {}),
    (oe.useDeferredValue = function (N, B) {
      return X.H.useDeferredValue(N, B)
    }),
    (oe.useEffect = function (N, B) {
      return X.H.useEffect(N, B)
    }),
    (oe.useEffectEvent = function (N) {
      return X.H.useEffectEvent(N)
    }),
    (oe.useId = function () {
      return X.H.useId()
    }),
    (oe.useImperativeHandle = function (N, B, J) {
      return X.H.useImperativeHandle(N, B, J)
    }),
    (oe.useInsertionEffect = function (N, B) {
      return X.H.useInsertionEffect(N, B)
    }),
    (oe.useLayoutEffect = function (N, B) {
      return X.H.useLayoutEffect(N, B)
    }),
    (oe.useMemo = function (N, B) {
      return X.H.useMemo(N, B)
    }),
    (oe.useOptimistic = function (N, B) {
      return X.H.useOptimistic(N, B)
    }),
    (oe.useReducer = function (N, B, J) {
      return X.H.useReducer(N, B, J)
    }),
    (oe.useRef = function (N) {
      return X.H.useRef(N)
    }),
    (oe.useState = function (N) {
      return X.H.useState(N)
    }),
    (oe.useSyncExternalStore = function (N, B, J) {
      return X.H.useSyncExternalStore(N, B, J)
    }),
    (oe.useTransition = function () {
      return X.H.useTransition()
    }),
    (oe.version = '19.2.3'),
    oe
  )
}
var Oy
function Pf() {
  return (Oy || ((Oy = 1), (_f.exports = U0())), _f.exports)
}
var W = Pf(),
  Tf = { exports: {} },
  Zi = {},
  Nf = { exports: {} },
  xf = {}
/**
 * @license React
 * scheduler.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */ var jy
function B0() {
  return (
    jy ||
      ((jy = 1),
      (function (s) {
        function l(z, Q) {
          var H = z.length
          z.push(Q)
          e: for (; 0 < H; ) {
            var ie = (H - 1) >>> 1,
              ge = z[ie]
            if (0 < c(ge, Q)) ((z[ie] = Q), (z[H] = ge), (H = ie))
            else break e
          }
        }
        function a(z) {
          return z.length === 0 ? null : z[0]
        }
        function u(z) {
          if (z.length === 0) return null
          var Q = z[0],
            H = z.pop()
          if (H !== Q) {
            z[0] = H
            e: for (var ie = 0, ge = z.length, N = ge >>> 1; ie < N; ) {
              var B = 2 * (ie + 1) - 1,
                J = z[B],
                ne = B + 1,
                he = z[ne]
              if (0 > c(J, H))
                ne < ge && 0 > c(he, J) ? ((z[ie] = he), (z[ne] = H), (ie = ne)) : ((z[ie] = J), (z[B] = H), (ie = B))
              else if (ne < ge && 0 > c(he, H)) ((z[ie] = he), (z[ne] = H), (ie = ne))
              else break e
            }
          }
          return Q
        }
        function c(z, Q) {
          var H = z.sortIndex - Q.sortIndex
          return H !== 0 ? H : z.id - Q.id
        }
        if (((s.unstable_now = void 0), typeof performance == 'object' && typeof performance.now == 'function')) {
          var f = performance
          s.unstable_now = function () {
            return f.now()
          }
        } else {
          var d = Date,
            m = d.now()
          s.unstable_now = function () {
            return d.now() - m
          }
        }
        var g = [],
          p = [],
          _ = 1,
          S = null,
          O = 3,
          E = !1,
          U = !1,
          A = !1,
          M = !1,
          K = typeof setTimeout == 'function' ? setTimeout : null,
          Z = typeof clearTimeout == 'function' ? clearTimeout : null,
          I = typeof setImmediate < 'u' ? setImmediate : null
        function Y(z) {
          for (var Q = a(p); Q !== null; ) {
            if (Q.callback === null) u(p)
            else if (Q.startTime <= z) (u(p), (Q.sortIndex = Q.expirationTime), l(g, Q))
            else break
            Q = a(p)
          }
        }
        function L(z) {
          if (((A = !1), Y(z), !U))
            if (a(g) !== null) ((U = !0), $ || (($ = !0), F()))
            else {
              var Q = a(p)
              Q !== null && Ot(L, Q.startTime - z)
            }
        }
        var $ = !1,
          X = -1,
          G = 5,
          ce = -1
        function We() {
          return M ? !0 : !(s.unstable_now() - ce < G)
        }
        function Ke() {
          if (((M = !1), $)) {
            var z = s.unstable_now()
            ce = z
            var Q = !0
            try {
              e: {
                ;((U = !1), A && ((A = !1), Z(X), (X = -1)), (E = !0))
                var H = O
                try {
                  t: {
                    for (Y(z), S = a(g); S !== null && !(S.expirationTime > z && We()); ) {
                      var ie = S.callback
                      if (typeof ie == 'function') {
                        ;((S.callback = null), (O = S.priorityLevel))
                        var ge = ie(S.expirationTime <= z)
                        if (((z = s.unstable_now()), typeof ge == 'function')) {
                          ;((S.callback = ge), Y(z), (Q = !0))
                          break t
                        }
                        ;(S === a(g) && u(g), Y(z))
                      } else u(g)
                      S = a(g)
                    }
                    if (S !== null) Q = !0
                    else {
                      var N = a(p)
                      ;(N !== null && Ot(L, N.startTime - z), (Q = !1))
                    }
                  }
                  break e
                } finally {
                  ;((S = null), (O = H), (E = !1))
                }
                Q = void 0
              }
            } finally {
              Q ? F() : ($ = !1)
            }
          }
        }
        var F
        if (typeof I == 'function')
          F = function () {
            I(Ke)
          }
        else if (typeof MessageChannel < 'u') {
          var Me = new MessageChannel(),
            At = Me.port2
          ;((Me.port1.onmessage = Ke),
            (F = function () {
              At.postMessage(null)
            }))
        } else
          F = function () {
            K(Ke, 0)
          }
        function Ot(z, Q) {
          X = K(function () {
            z(s.unstable_now())
          }, Q)
        }
        ;((s.unstable_IdlePriority = 5),
          (s.unstable_ImmediatePriority = 1),
          (s.unstable_LowPriority = 4),
          (s.unstable_NormalPriority = 3),
          (s.unstable_Profiling = null),
          (s.unstable_UserBlockingPriority = 2),
          (s.unstable_cancelCallback = function (z) {
            z.callback = null
          }),
          (s.unstable_forceFrameRate = function (z) {
            0 > z || 125 < z
              ? console.error(
                  'forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported'
                )
              : (G = 0 < z ? Math.floor(1e3 / z) : 5)
          }),
          (s.unstable_getCurrentPriorityLevel = function () {
            return O
          }),
          (s.unstable_next = function (z) {
            switch (O) {
              case 1:
              case 2:
              case 3:
                var Q = 3
                break
              default:
                Q = O
            }
            var H = O
            O = Q
            try {
              return z()
            } finally {
              O = H
            }
          }),
          (s.unstable_requestPaint = function () {
            M = !0
          }),
          (s.unstable_runWithPriority = function (z, Q) {
            switch (z) {
              case 1:
              case 2:
              case 3:
              case 4:
              case 5:
                break
              default:
                z = 3
            }
            var H = O
            O = z
            try {
              return Q()
            } finally {
              O = H
            }
          }),
          (s.unstable_scheduleCallback = function (z, Q, H) {
            var ie = s.unstable_now()
            switch (
              (typeof H == 'object' && H !== null
                ? ((H = H.delay), (H = typeof H == 'number' && 0 < H ? ie + H : ie))
                : (H = ie),
              z)
            ) {
              case 1:
                var ge = -1
                break
              case 2:
                ge = 250
                break
              case 5:
                ge = 1073741823
                break
              case 4:
                ge = 1e4
                break
              default:
                ge = 5e3
            }
            return (
              (ge = H + ge),
              (z = { id: _++, callback: Q, priorityLevel: z, startTime: H, expirationTime: ge, sortIndex: -1 }),
              H > ie
                ? ((z.sortIndex = H),
                  l(p, z),
                  a(g) === null && z === a(p) && (A ? (Z(X), (X = -1)) : (A = !0), Ot(L, H - ie)))
                : ((z.sortIndex = ge), l(g, z), U || E || ((U = !0), $ || (($ = !0), F()))),
              z
            )
          }),
          (s.unstable_shouldYield = We),
          (s.unstable_wrapCallback = function (z) {
            var Q = O
            return function () {
              var H = O
              O = Q
              try {
                return z.apply(this, arguments)
              } finally {
                O = H
              }
            }
          }))
      })(xf)),
    xf
  )
}
var wy
function q0() {
  return (wy || ((wy = 1), (Nf.exports = B0())), Nf.exports)
}
var Ef = { exports: {} },
  ot = {}
/**
 * @license React
 * react-dom.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */ var ky
function H0() {
  if (ky) return ot
  ky = 1
  var s = Pf()
  function l(g) {
    var p = 'https://react.dev/errors/' + g
    if (1 < arguments.length) {
      p += '?args[]=' + encodeURIComponent(arguments[1])
      for (var _ = 2; _ < arguments.length; _++) p += '&args[]=' + encodeURIComponent(arguments[_])
    }
    return (
      'Minified React error #' +
      g +
      '; visit ' +
      p +
      ' for the full message or use the non-minified dev environment for full errors and additional helpful warnings.'
    )
  }
  function a() {}
  var u = {
      d: {
        f: a,
        r: function () {
          throw Error(l(522))
        },
        D: a,
        C: a,
        L: a,
        m: a,
        X: a,
        S: a,
        M: a,
      },
      p: 0,
      findDOMNode: null,
    },
    c = Symbol.for('react.portal')
  function f(g, p, _) {
    var S = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null
    return { $$typeof: c, key: S == null ? null : '' + S, children: g, containerInfo: p, implementation: _ }
  }
  var d = s.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE
  function m(g, p) {
    if (g === 'font') return ''
    if (typeof p == 'string') return p === 'use-credentials' ? p : ''
  }
  return (
    (ot.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = u),
    (ot.createPortal = function (g, p) {
      var _ = 2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null
      if (!p || (p.nodeType !== 1 && p.nodeType !== 9 && p.nodeType !== 11)) throw Error(l(299))
      return f(g, p, null, _)
    }),
    (ot.flushSync = function (g) {
      var p = d.T,
        _ = u.p
      try {
        if (((d.T = null), (u.p = 2), g)) return g()
      } finally {
        ;((d.T = p), (u.p = _), u.d.f())
      }
    }),
    (ot.preconnect = function (g, p) {
      typeof g == 'string' &&
        (p
          ? ((p = p.crossOrigin), (p = typeof p == 'string' ? (p === 'use-credentials' ? p : '') : void 0))
          : (p = null),
        u.d.C(g, p))
    }),
    (ot.prefetchDNS = function (g) {
      typeof g == 'string' && u.d.D(g)
    }),
    (ot.preinit = function (g, p) {
      if (typeof g == 'string' && p && typeof p.as == 'string') {
        var _ = p.as,
          S = m(_, p.crossOrigin),
          O = typeof p.integrity == 'string' ? p.integrity : void 0,
          E = typeof p.fetchPriority == 'string' ? p.fetchPriority : void 0
        _ === 'style'
          ? u.d.S(g, typeof p.precedence == 'string' ? p.precedence : void 0, {
              crossOrigin: S,
              integrity: O,
              fetchPriority: E,
            })
          : _ === 'script' &&
            u.d.X(g, {
              crossOrigin: S,
              integrity: O,
              fetchPriority: E,
              nonce: typeof p.nonce == 'string' ? p.nonce : void 0,
            })
      }
    }),
    (ot.preinitModule = function (g, p) {
      if (typeof g == 'string')
        if (typeof p == 'object' && p !== null) {
          if (p.as == null || p.as === 'script') {
            var _ = m(p.as, p.crossOrigin)
            u.d.M(g, {
              crossOrigin: _,
              integrity: typeof p.integrity == 'string' ? p.integrity : void 0,
              nonce: typeof p.nonce == 'string' ? p.nonce : void 0,
            })
          }
        } else p == null && u.d.M(g)
    }),
    (ot.preload = function (g, p) {
      if (typeof g == 'string' && typeof p == 'object' && p !== null && typeof p.as == 'string') {
        var _ = p.as,
          S = m(_, p.crossOrigin)
        u.d.L(g, _, {
          crossOrigin: S,
          integrity: typeof p.integrity == 'string' ? p.integrity : void 0,
          nonce: typeof p.nonce == 'string' ? p.nonce : void 0,
          type: typeof p.type == 'string' ? p.type : void 0,
          fetchPriority: typeof p.fetchPriority == 'string' ? p.fetchPriority : void 0,
          referrerPolicy: typeof p.referrerPolicy == 'string' ? p.referrerPolicy : void 0,
          imageSrcSet: typeof p.imageSrcSet == 'string' ? p.imageSrcSet : void 0,
          imageSizes: typeof p.imageSizes == 'string' ? p.imageSizes : void 0,
          media: typeof p.media == 'string' ? p.media : void 0,
        })
      }
    }),
    (ot.preloadModule = function (g, p) {
      if (typeof g == 'string')
        if (p) {
          var _ = m(p.as, p.crossOrigin)
          u.d.m(g, {
            as: typeof p.as == 'string' && p.as !== 'script' ? p.as : void 0,
            crossOrigin: _,
            integrity: typeof p.integrity == 'string' ? p.integrity : void 0,
          })
        } else u.d.m(g)
    }),
    (ot.requestFormReset = function (g) {
      u.d.r(g)
    }),
    (ot.unstable_batchedUpdates = function (g, p) {
      return g(p)
    }),
    (ot.useFormState = function (g, p, _) {
      return d.H.useFormState(g, p, _)
    }),
    (ot.useFormStatus = function () {
      return d.H.useHostTransitionStatus()
    }),
    (ot.version = '19.2.3'),
    ot
  )
}
var Cy
function Y0() {
  if (Cy) return Ef.exports
  Cy = 1
  function s() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > 'u' || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != 'function'))
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(s)
      } catch (l) {
        console.error(l)
      }
  }
  return (s(), (Ef.exports = H0()), Ef.exports)
}
/**
 * @license React
 * react-dom-client.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */ var My
function Z0() {
  if (My) return Zi
  My = 1
  var s = q0(),
    l = Pf(),
    a = Y0()
  function u(e) {
    var t = 'https://react.dev/errors/' + e
    if (1 < arguments.length) {
      t += '?args[]=' + encodeURIComponent(arguments[1])
      for (var n = 2; n < arguments.length; n++) t += '&args[]=' + encodeURIComponent(arguments[n])
    }
    return (
      'Minified React error #' +
      e +
      '; visit ' +
      t +
      ' for the full message or use the non-minified dev environment for full errors and additional helpful warnings.'
    )
  }
  function c(e) {
    return !(!e || (e.nodeType !== 1 && e.nodeType !== 9 && e.nodeType !== 11))
  }
  function f(e) {
    var t = e,
      n = e
    if (e.alternate) for (; t.return; ) t = t.return
    else {
      e = t
      do ((t = e), (t.flags & 4098) !== 0 && (n = t.return), (e = t.return))
      while (e)
    }
    return t.tag === 3 ? n : null
  }
  function d(e) {
    if (e.tag === 13) {
      var t = e.memoizedState
      if ((t === null && ((e = e.alternate), e !== null && (t = e.memoizedState)), t !== null)) return t.dehydrated
    }
    return null
  }
  function m(e) {
    if (e.tag === 31) {
      var t = e.memoizedState
      if ((t === null && ((e = e.alternate), e !== null && (t = e.memoizedState)), t !== null)) return t.dehydrated
    }
    return null
  }
  function g(e) {
    if (f(e) !== e) throw Error(u(188))
  }
  function p(e) {
    var t = e.alternate
    if (!t) {
      if (((t = f(e)), t === null)) throw Error(u(188))
      return t !== e ? null : e
    }
    for (var n = e, i = t; ; ) {
      var r = n.return
      if (r === null) break
      var o = r.alternate
      if (o === null) {
        if (((i = r.return), i !== null)) {
          n = i
          continue
        }
        break
      }
      if (r.child === o.child) {
        for (o = r.child; o; ) {
          if (o === n) return (g(r), e)
          if (o === i) return (g(r), t)
          o = o.sibling
        }
        throw Error(u(188))
      }
      if (n.return !== i.return) ((n = r), (i = o))
      else {
        for (var h = !1, v = r.child; v; ) {
          if (v === n) {
            ;((h = !0), (n = r), (i = o))
            break
          }
          if (v === i) {
            ;((h = !0), (i = r), (n = o))
            break
          }
          v = v.sibling
        }
        if (!h) {
          for (v = o.child; v; ) {
            if (v === n) {
              ;((h = !0), (n = o), (i = r))
              break
            }
            if (v === i) {
              ;((h = !0), (i = o), (n = r))
              break
            }
            v = v.sibling
          }
          if (!h) throw Error(u(189))
        }
      }
      if (n.alternate !== i) throw Error(u(190))
    }
    if (n.tag !== 3) throw Error(u(188))
    return n.stateNode.current === n ? e : t
  }
  function _(e) {
    var t = e.tag
    if (t === 5 || t === 26 || t === 27 || t === 6) return e
    for (e = e.child; e !== null; ) {
      if (((t = _(e)), t !== null)) return t
      e = e.sibling
    }
    return null
  }
  var S = Object.assign,
    O = Symbol.for('react.element'),
    E = Symbol.for('react.transitional.element'),
    U = Symbol.for('react.portal'),
    A = Symbol.for('react.fragment'),
    M = Symbol.for('react.strict_mode'),
    K = Symbol.for('react.profiler'),
    Z = Symbol.for('react.consumer'),
    I = Symbol.for('react.context'),
    Y = Symbol.for('react.forward_ref'),
    L = Symbol.for('react.suspense'),
    $ = Symbol.for('react.suspense_list'),
    X = Symbol.for('react.memo'),
    G = Symbol.for('react.lazy'),
    ce = Symbol.for('react.activity'),
    We = Symbol.for('react.memo_cache_sentinel'),
    Ke = Symbol.iterator
  function F(e) {
    return e === null || typeof e != 'object'
      ? null
      : ((e = (Ke && e[Ke]) || e['@@iterator']), typeof e == 'function' ? e : null)
  }
  var Me = Symbol.for('react.client.reference')
  function At(e) {
    if (e == null) return null
    if (typeof e == 'function') return e.$$typeof === Me ? null : e.displayName || e.name || null
    if (typeof e == 'string') return e
    switch (e) {
      case A:
        return 'Fragment'
      case K:
        return 'Profiler'
      case M:
        return 'StrictMode'
      case L:
        return 'Suspense'
      case $:
        return 'SuspenseList'
      case ce:
        return 'Activity'
    }
    if (typeof e == 'object')
      switch (e.$$typeof) {
        case U:
          return 'Portal'
        case I:
          return e.displayName || 'Context'
        case Z:
          return (e._context.displayName || 'Context') + '.Consumer'
        case Y:
          var t = e.render
          return (
            (e = e.displayName),
            e || ((e = t.displayName || t.name || ''), (e = e !== '' ? 'ForwardRef(' + e + ')' : 'ForwardRef')),
            e
          )
        case X:
          return ((t = e.displayName || null), t !== null ? t : At(e.type) || 'Memo')
        case G:
          ;((t = e._payload), (e = e._init))
          try {
            return At(e(t))
          } catch {}
      }
    return null
  }
  var Ot = Array.isArray,
    z = l.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
    Q = a.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
    H = { pending: !1, data: null, method: null, action: null },
    ie = [],
    ge = -1
  function N(e) {
    return { current: e }
  }
  function B(e) {
    0 > ge || ((e.current = ie[ge]), (ie[ge] = null), ge--)
  }
  function J(e, t) {
    ;(ge++, (ie[ge] = e.current), (e.current = t))
  }
  var ne = N(null),
    he = N(null),
    ve = N(null),
    we = N(null)
  function ht(e, t) {
    switch ((J(ve, t), J(he, e), J(ne, null), t.nodeType)) {
      case 9:
      case 11:
        e = (e = t.documentElement) && (e = e.namespaceURI) ? Qm(e) : 0
        break
      default:
        if (((e = t.tagName), (t = t.namespaceURI))) ((t = Qm(t)), (e = Xm(t, e)))
        else
          switch (e) {
            case 'svg':
              e = 1
              break
            case 'math':
              e = 2
              break
            default:
              e = 0
          }
    }
    ;(B(ne), J(ne, e))
  }
  function Xe() {
    ;(B(ne), B(he), B(ve))
  }
  function Xa(e) {
    e.memoizedState !== null && J(we, e)
    var t = ne.current,
      n = Xm(t, e.type)
    t !== n && (J(he, e), J(ne, n))
  }
  function ls(e) {
    ;(he.current === e && (B(ne), B(he)), we.current === e && (B(we), (Ui._currentValue = H)))
  }
  var tc, No
  function hl(e) {
    if (tc === void 0)
      try {
        throw Error()
      } catch (n) {
        var t = n.stack.trim().match(/\n( *(at )?)/)
        ;((tc = (t && t[1]) || ''),
          (No =
            -1 <
            n.stack.indexOf(`
    at`)
              ? ' (<anonymous>)'
              : -1 < n.stack.indexOf('@')
                ? '@unknown:0:0'
                : ''))
      }
    return (
      `
` +
      tc +
      e +
      No
    )
  }
  var nc = !1
  function lc(e, t) {
    if (!e || nc) return ''
    nc = !0
    var n = Error.prepareStackTrace
    Error.prepareStackTrace = void 0
    try {
      var i = {
        DetermineComponentFrameRoot: function () {
          try {
            if (t) {
              var q = function () {
                throw Error()
              }
              if (
                (Object.defineProperty(q.prototype, 'props', {
                  set: function () {
                    throw Error()
                  },
                }),
                typeof Reflect == 'object' && Reflect.construct)
              ) {
                try {
                  Reflect.construct(q, [])
                } catch (C) {
                  var k = C
                }
                Reflect.construct(e, [], q)
              } else {
                try {
                  q.call()
                } catch (C) {
                  k = C
                }
                e.call(q.prototype)
              }
            } else {
              try {
                throw Error()
              } catch (C) {
                k = C
              }
              ;(q = e()) && typeof q.catch == 'function' && q.catch(function () {})
            }
          } catch (C) {
            if (C && k && typeof C.stack == 'string') return [C.stack, k.stack]
          }
          return [null, null]
        },
      }
      i.DetermineComponentFrameRoot.displayName = 'DetermineComponentFrameRoot'
      var r = Object.getOwnPropertyDescriptor(i.DetermineComponentFrameRoot, 'name')
      r &&
        r.configurable &&
        Object.defineProperty(i.DetermineComponentFrameRoot, 'name', { value: 'DetermineComponentFrameRoot' })
      var o = i.DetermineComponentFrameRoot(),
        h = o[0],
        v = o[1]
      if (h && v) {
        var b = h.split(`
`),
          w = v.split(`
`)
        for (r = i = 0; i < b.length && !b[i].includes('DetermineComponentFrameRoot'); ) i++
        for (; r < w.length && !w[r].includes('DetermineComponentFrameRoot'); ) r++
        if (i === b.length || r === w.length)
          for (i = b.length - 1, r = w.length - 1; 1 <= i && 0 <= r && b[i] !== w[r]; ) r--
        for (; 1 <= i && 0 <= r; i--, r--)
          if (b[i] !== w[r]) {
            if (i !== 1 || r !== 1)
              do
                if ((i--, r--, 0 > r || b[i] !== w[r])) {
                  var D =
                    `
` + b[i].replace(' at new ', ' at ')
                  return (
                    e.displayName && D.includes('<anonymous>') && (D = D.replace('<anonymous>', e.displayName)),
                    D
                  )
                }
              while (1 <= i && 0 <= r)
            break
          }
      }
    } finally {
      ;((nc = !1), (Error.prepareStackTrace = n))
    }
    return (n = e ? e.displayName || e.name : '') ? hl(n) : ''
  }
  function dg(e, t) {
    switch (e.tag) {
      case 26:
      case 27:
      case 5:
        return hl(e.type)
      case 16:
        return hl('Lazy')
      case 13:
        return e.child !== t && t !== null ? hl('Suspense Fallback') : hl('Suspense')
      case 19:
        return hl('SuspenseList')
      case 0:
      case 15:
        return lc(e.type, !1)
      case 11:
        return lc(e.type.render, !1)
      case 1:
        return lc(e.type, !0)
      case 31:
        return hl('Activity')
      default:
        return ''
    }
  }
  function xo(e) {
    try {
      var t = '',
        n = null
      do ((t += dg(e, n)), (n = e), (e = e.return))
      while (e)
      return t
    } catch (i) {
      return (
        `
Error generating stack: ` +
        i.message +
        `
` +
        i.stack
      )
    }
  }
  var ac = Object.prototype.hasOwnProperty,
    ic = s.unstable_scheduleCallback,
    sc = s.unstable_cancelCallback,
    hg = s.unstable_shouldYield,
    mg = s.unstable_requestPaint,
    jt = s.unstable_now,
    yg = s.unstable_getCurrentPriorityLevel,
    Eo = s.unstable_ImmediatePriority,
    Ao = s.unstable_UserBlockingPriority,
    as = s.unstable_NormalPriority,
    pg = s.unstable_LowPriority,
    Oo = s.unstable_IdlePriority,
    gg = s.log,
    vg = s.unstable_setDisableYieldValue,
    Ja = null,
    wt = null
  function zn(e) {
    if ((typeof gg == 'function' && vg(e), wt && typeof wt.setStrictMode == 'function'))
      try {
        wt.setStrictMode(Ja, e)
      } catch {}
  }
  var kt = Math.clz32 ? Math.clz32 : _g,
    bg = Math.log,
    Sg = Math.LN2
  function _g(e) {
    return ((e >>>= 0), e === 0 ? 32 : (31 - ((bg(e) / Sg) | 0)) | 0)
  }
  var is = 256,
    ss = 262144,
    us = 4194304
  function ml(e) {
    var t = e & 42
    if (t !== 0) return t
    switch (e & -e) {
      case 1:
        return 1
      case 2:
        return 2
      case 4:
        return 4
      case 8:
        return 8
      case 16:
        return 16
      case 32:
        return 32
      case 64:
        return 64
      case 128:
        return 128
      case 256:
      case 512:
      case 1024:
      case 2048:
      case 4096:
      case 8192:
      case 16384:
      case 32768:
      case 65536:
      case 131072:
        return e & 261888
      case 262144:
      case 524288:
      case 1048576:
      case 2097152:
        return e & 3932160
      case 4194304:
      case 8388608:
      case 16777216:
      case 33554432:
        return e & 62914560
      case 67108864:
        return 67108864
      case 134217728:
        return 134217728
      case 268435456:
        return 268435456
      case 536870912:
        return 536870912
      case 1073741824:
        return 0
      default:
        return e
    }
  }
  function cs(e, t, n) {
    var i = e.pendingLanes
    if (i === 0) return 0
    var r = 0,
      o = e.suspendedLanes,
      h = e.pingedLanes
    e = e.warmLanes
    var v = i & 134217727
    return (
      v !== 0
        ? ((i = v & ~o),
          i !== 0 ? (r = ml(i)) : ((h &= v), h !== 0 ? (r = ml(h)) : n || ((n = v & ~e), n !== 0 && (r = ml(n)))))
        : ((v = i & ~o), v !== 0 ? (r = ml(v)) : h !== 0 ? (r = ml(h)) : n || ((n = i & ~e), n !== 0 && (r = ml(n)))),
      r === 0
        ? 0
        : t !== 0 &&
            t !== r &&
            (t & o) === 0 &&
            ((o = r & -r), (n = t & -t), o >= n || (o === 32 && (n & 4194048) !== 0))
          ? t
          : r
    )
  }
  function Ia(e, t) {
    return (e.pendingLanes & ~(e.suspendedLanes & ~e.pingedLanes) & t) === 0
  }
  function Tg(e, t) {
    switch (e) {
      case 1:
      case 2:
      case 4:
      case 8:
      case 64:
        return t + 250
      case 16:
      case 32:
      case 128:
      case 256:
      case 512:
      case 1024:
      case 2048:
      case 4096:
      case 8192:
      case 16384:
      case 32768:
      case 65536:
      case 131072:
      case 262144:
      case 524288:
      case 1048576:
      case 2097152:
        return t + 5e3
      case 4194304:
      case 8388608:
      case 16777216:
      case 33554432:
        return -1
      case 67108864:
      case 134217728:
      case 268435456:
      case 536870912:
      case 1073741824:
        return -1
      default:
        return -1
    }
  }
  function jo() {
    var e = us
    return ((us <<= 1), (us & 62914560) === 0 && (us = 4194304), e)
  }
  function uc(e) {
    for (var t = [], n = 0; 31 > n; n++) t.push(e)
    return t
  }
  function Wa(e, t) {
    ;((e.pendingLanes |= t), t !== 268435456 && ((e.suspendedLanes = 0), (e.pingedLanes = 0), (e.warmLanes = 0)))
  }
  function Ng(e, t, n, i, r, o) {
    var h = e.pendingLanes
    ;((e.pendingLanes = n),
      (e.suspendedLanes = 0),
      (e.pingedLanes = 0),
      (e.warmLanes = 0),
      (e.expiredLanes &= n),
      (e.entangledLanes &= n),
      (e.errorRecoveryDisabledLanes &= n),
      (e.shellSuspendCounter = 0))
    var v = e.entanglements,
      b = e.expirationTimes,
      w = e.hiddenUpdates
    for (n = h & ~n; 0 < n; ) {
      var D = 31 - kt(n),
        q = 1 << D
      ;((v[D] = 0), (b[D] = -1))
      var k = w[D]
      if (k !== null)
        for (w[D] = null, D = 0; D < k.length; D++) {
          var C = k[D]
          C !== null && (C.lane &= -536870913)
        }
      n &= ~q
    }
    ;(i !== 0 && wo(e, i, 0), o !== 0 && r === 0 && e.tag !== 0 && (e.suspendedLanes |= o & ~(h & ~t)))
  }
  function wo(e, t, n) {
    ;((e.pendingLanes |= t), (e.suspendedLanes &= ~t))
    var i = 31 - kt(t)
    ;((e.entangledLanes |= t), (e.entanglements[i] = e.entanglements[i] | 1073741824 | (n & 261930)))
  }
  function ko(e, t) {
    var n = (e.entangledLanes |= t)
    for (e = e.entanglements; n; ) {
      var i = 31 - kt(n),
        r = 1 << i
      ;((r & t) | (e[i] & t) && (e[i] |= t), (n &= ~r))
    }
  }
  function Co(e, t) {
    var n = t & -t
    return ((n = (n & 42) !== 0 ? 1 : cc(n)), (n & (e.suspendedLanes | t)) !== 0 ? 0 : n)
  }
  function cc(e) {
    switch (e) {
      case 2:
        e = 1
        break
      case 8:
        e = 4
        break
      case 32:
        e = 16
        break
      case 256:
      case 512:
      case 1024:
      case 2048:
      case 4096:
      case 8192:
      case 16384:
      case 32768:
      case 65536:
      case 131072:
      case 262144:
      case 524288:
      case 1048576:
      case 2097152:
      case 4194304:
      case 8388608:
      case 16777216:
      case 33554432:
        e = 128
        break
      case 268435456:
        e = 134217728
        break
      default:
        e = 0
    }
    return e
  }
  function rc(e) {
    return ((e &= -e), 2 < e ? (8 < e ? ((e & 134217727) !== 0 ? 32 : 268435456) : 8) : 2)
  }
  function Mo() {
    var e = Q.p
    return e !== 0 ? e : ((e = window.event), e === void 0 ? 32 : gy(e.type))
  }
  function Do(e, t) {
    var n = Q.p
    try {
      return ((Q.p = e), t())
    } finally {
      Q.p = n
    }
  }
  var Ln = Math.random().toString(36).slice(2),
    st = '__reactFiber$' + Ln,
    vt = '__reactProps$' + Ln,
    Yl = '__reactContainer$' + Ln,
    fc = '__reactEvents$' + Ln,
    xg = '__reactListeners$' + Ln,
    Eg = '__reactHandles$' + Ln,
    zo = '__reactResources$' + Ln,
    Fa = '__reactMarker$' + Ln
  function oc(e) {
    ;(delete e[st], delete e[vt], delete e[fc], delete e[xg], delete e[Eg])
  }
  function Zl(e) {
    var t = e[st]
    if (t) return t
    for (var n = e.parentNode; n; ) {
      if ((t = n[Yl] || n[st])) {
        if (((n = t.alternate), t.child !== null || (n !== null && n.child !== null)))
          for (e = ty(e); e !== null; ) {
            if ((n = e[st])) return n
            e = ty(e)
          }
        return t
      }
      ;((e = n), (n = e.parentNode))
    }
    return null
  }
  function Vl(e) {
    if ((e = e[st] || e[Yl])) {
      var t = e.tag
      if (t === 5 || t === 6 || t === 13 || t === 31 || t === 26 || t === 27 || t === 3) return e
    }
    return null
  }
  function Pa(e) {
    var t = e.tag
    if (t === 5 || t === 26 || t === 27 || t === 6) return e.stateNode
    throw Error(u(33))
  }
  function Kl(e) {
    var t = e[zo]
    return (t || (t = e[zo] = { hoistableStyles: new Map(), hoistableScripts: new Map() }), t)
  }
  function at(e) {
    e[Fa] = !0
  }
  var Lo = new Set(),
    Ro = {}
  function yl(e, t) {
    ;(Gl(e, t), Gl(e + 'Capture', t))
  }
  function Gl(e, t) {
    for (Ro[e] = t, e = 0; e < t.length; e++) Lo.add(t[e])
  }
  var Ag = RegExp(
      '^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$'
    ),
    Uo = {},
    Bo = {}
  function Og(e) {
    return ac.call(Bo, e) ? !0 : ac.call(Uo, e) ? !1 : Ag.test(e) ? (Bo[e] = !0) : ((Uo[e] = !0), !1)
  }
  function rs(e, t, n) {
    if (Og(t))
      if (n === null) e.removeAttribute(t)
      else {
        switch (typeof n) {
          case 'undefined':
          case 'function':
          case 'symbol':
            e.removeAttribute(t)
            return
          case 'boolean':
            var i = t.toLowerCase().slice(0, 5)
            if (i !== 'data-' && i !== 'aria-') {
              e.removeAttribute(t)
              return
            }
        }
        e.setAttribute(t, '' + n)
      }
  }
  function fs(e, t, n) {
    if (n === null) e.removeAttribute(t)
    else {
      switch (typeof n) {
        case 'undefined':
        case 'function':
        case 'symbol':
        case 'boolean':
          e.removeAttribute(t)
          return
      }
      e.setAttribute(t, '' + n)
    }
  }
  function dn(e, t, n, i) {
    if (i === null) e.removeAttribute(n)
    else {
      switch (typeof i) {
        case 'undefined':
        case 'function':
        case 'symbol':
        case 'boolean':
          e.removeAttribute(n)
          return
      }
      e.setAttributeNS(t, n, '' + i)
    }
  }
  function qt(e) {
    switch (typeof e) {
      case 'bigint':
      case 'boolean':
      case 'number':
      case 'string':
      case 'undefined':
        return e
      case 'object':
        return e
      default:
        return ''
    }
  }
  function qo(e) {
    var t = e.type
    return (e = e.nodeName) && e.toLowerCase() === 'input' && (t === 'checkbox' || t === 'radio')
  }
  function jg(e, t, n) {
    var i = Object.getOwnPropertyDescriptor(e.constructor.prototype, t)
    if (!e.hasOwnProperty(t) && typeof i < 'u' && typeof i.get == 'function' && typeof i.set == 'function') {
      var r = i.get,
        o = i.set
      return (
        Object.defineProperty(e, t, {
          configurable: !0,
          get: function () {
            return r.call(this)
          },
          set: function (h) {
            ;((n = '' + h), o.call(this, h))
          },
        }),
        Object.defineProperty(e, t, { enumerable: i.enumerable }),
        {
          getValue: function () {
            return n
          },
          setValue: function (h) {
            n = '' + h
          },
          stopTracking: function () {
            ;((e._valueTracker = null), delete e[t])
          },
        }
      )
    }
  }
  function dc(e) {
    if (!e._valueTracker) {
      var t = qo(e) ? 'checked' : 'value'
      e._valueTracker = jg(e, t, '' + e[t])
    }
  }
  function Ho(e) {
    if (!e) return !1
    var t = e._valueTracker
    if (!t) return !0
    var n = t.getValue(),
      i = ''
    return (e && (i = qo(e) ? (e.checked ? 'true' : 'false') : e.value), (e = i), e !== n ? (t.setValue(e), !0) : !1)
  }
  function os(e) {
    if (((e = e || (typeof document < 'u' ? document : void 0)), typeof e > 'u')) return null
    try {
      return e.activeElement || e.body
    } catch {
      return e.body
    }
  }
  var wg = /[\n"\\]/g
  function Ht(e) {
    return e.replace(wg, function (t) {
      return '\\' + t.charCodeAt(0).toString(16) + ' '
    })
  }
  function hc(e, t, n, i, r, o, h, v) {
    ;((e.name = ''),
      h != null && typeof h != 'function' && typeof h != 'symbol' && typeof h != 'boolean'
        ? (e.type = h)
        : e.removeAttribute('type'),
      t != null
        ? h === 'number'
          ? ((t === 0 && e.value === '') || e.value != t) && (e.value = '' + qt(t))
          : e.value !== '' + qt(t) && (e.value = '' + qt(t))
        : (h !== 'submit' && h !== 'reset') || e.removeAttribute('value'),
      t != null ? mc(e, h, qt(t)) : n != null ? mc(e, h, qt(n)) : i != null && e.removeAttribute('value'),
      r == null && o != null && (e.defaultChecked = !!o),
      r != null && (e.checked = r && typeof r != 'function' && typeof r != 'symbol'),
      v != null && typeof v != 'function' && typeof v != 'symbol' && typeof v != 'boolean'
        ? (e.name = '' + qt(v))
        : e.removeAttribute('name'))
  }
  function Yo(e, t, n, i, r, o, h, v) {
    if (
      (o != null && typeof o != 'function' && typeof o != 'symbol' && typeof o != 'boolean' && (e.type = o),
      t != null || n != null)
    ) {
      if (!((o !== 'submit' && o !== 'reset') || t != null)) {
        dc(e)
        return
      }
      ;((n = n != null ? '' + qt(n) : ''),
        (t = t != null ? '' + qt(t) : n),
        v || t === e.value || (e.value = t),
        (e.defaultValue = t))
    }
    ;((i = i ?? r),
      (i = typeof i != 'function' && typeof i != 'symbol' && !!i),
      (e.checked = v ? e.checked : !!i),
      (e.defaultChecked = !!i),
      h != null && typeof h != 'function' && typeof h != 'symbol' && typeof h != 'boolean' && (e.name = h),
      dc(e))
  }
  function mc(e, t, n) {
    ;(t === 'number' && os(e.ownerDocument) === e) || e.defaultValue === '' + n || (e.defaultValue = '' + n)
  }
  function $l(e, t, n, i) {
    if (((e = e.options), t)) {
      t = {}
      for (var r = 0; r < n.length; r++) t['$' + n[r]] = !0
      for (n = 0; n < e.length; n++)
        ((r = t.hasOwnProperty('$' + e[n].value)),
          e[n].selected !== r && (e[n].selected = r),
          r && i && (e[n].defaultSelected = !0))
    } else {
      for (n = '' + qt(n), t = null, r = 0; r < e.length; r++) {
        if (e[r].value === n) {
          ;((e[r].selected = !0), i && (e[r].defaultSelected = !0))
          return
        }
        t !== null || e[r].disabled || (t = e[r])
      }
      t !== null && (t.selected = !0)
    }
  }
  function Zo(e, t, n) {
    if (t != null && ((t = '' + qt(t)), t !== e.value && (e.value = t), n == null)) {
      e.defaultValue !== t && (e.defaultValue = t)
      return
    }
    e.defaultValue = n != null ? '' + qt(n) : ''
  }
  function Vo(e, t, n, i) {
    if (t == null) {
      if (i != null) {
        if (n != null) throw Error(u(92))
        if (Ot(i)) {
          if (1 < i.length) throw Error(u(93))
          i = i[0]
        }
        n = i
      }
      ;(n == null && (n = ''), (t = n))
    }
    ;((n = qt(t)), (e.defaultValue = n), (i = e.textContent), i === n && i !== '' && i !== null && (e.value = i), dc(e))
  }
  function Ql(e, t) {
    if (t) {
      var n = e.firstChild
      if (n && n === e.lastChild && n.nodeType === 3) {
        n.nodeValue = t
        return
      }
    }
    e.textContent = t
  }
  var kg = new Set(
    'animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp'.split(
      ' '
    )
  )
  function Ko(e, t, n) {
    var i = t.indexOf('--') === 0
    n == null || typeof n == 'boolean' || n === ''
      ? i
        ? e.setProperty(t, '')
        : t === 'float'
          ? (e.cssFloat = '')
          : (e[t] = '')
      : i
        ? e.setProperty(t, n)
        : typeof n != 'number' || n === 0 || kg.has(t)
          ? t === 'float'
            ? (e.cssFloat = n)
            : (e[t] = ('' + n).trim())
          : (e[t] = n + 'px')
  }
  function Go(e, t, n) {
    if (t != null && typeof t != 'object') throw Error(u(62))
    if (((e = e.style), n != null)) {
      for (var i in n)
        !n.hasOwnProperty(i) ||
          (t != null && t.hasOwnProperty(i)) ||
          (i.indexOf('--') === 0 ? e.setProperty(i, '') : i === 'float' ? (e.cssFloat = '') : (e[i] = ''))
      for (var r in t) ((i = t[r]), t.hasOwnProperty(r) && n[r] !== i && Ko(e, r, i))
    } else for (var o in t) t.hasOwnProperty(o) && Ko(e, o, t[o])
  }
  function yc(e) {
    if (e.indexOf('-') === -1) return !1
    switch (e) {
      case 'annotation-xml':
      case 'color-profile':
      case 'font-face':
      case 'font-face-src':
      case 'font-face-uri':
      case 'font-face-format':
      case 'font-face-name':
      case 'missing-glyph':
        return !1
      default:
        return !0
    }
  }
  var Cg = new Map([
      ['acceptCharset', 'accept-charset'],
      ['htmlFor', 'for'],
      ['httpEquiv', 'http-equiv'],
      ['crossOrigin', 'crossorigin'],
      ['accentHeight', 'accent-height'],
      ['alignmentBaseline', 'alignment-baseline'],
      ['arabicForm', 'arabic-form'],
      ['baselineShift', 'baseline-shift'],
      ['capHeight', 'cap-height'],
      ['clipPath', 'clip-path'],
      ['clipRule', 'clip-rule'],
      ['colorInterpolation', 'color-interpolation'],
      ['colorInterpolationFilters', 'color-interpolation-filters'],
      ['colorProfile', 'color-profile'],
      ['colorRendering', 'color-rendering'],
      ['dominantBaseline', 'dominant-baseline'],
      ['enableBackground', 'enable-background'],
      ['fillOpacity', 'fill-opacity'],
      ['fillRule', 'fill-rule'],
      ['floodColor', 'flood-color'],
      ['floodOpacity', 'flood-opacity'],
      ['fontFamily', 'font-family'],
      ['fontSize', 'font-size'],
      ['fontSizeAdjust', 'font-size-adjust'],
      ['fontStretch', 'font-stretch'],
      ['fontStyle', 'font-style'],
      ['fontVariant', 'font-variant'],
      ['fontWeight', 'font-weight'],
      ['glyphName', 'glyph-name'],
      ['glyphOrientationHorizontal', 'glyph-orientation-horizontal'],
      ['glyphOrientationVertical', 'glyph-orientation-vertical'],
      ['horizAdvX', 'horiz-adv-x'],
      ['horizOriginX', 'horiz-origin-x'],
      ['imageRendering', 'image-rendering'],
      ['letterSpacing', 'letter-spacing'],
      ['lightingColor', 'lighting-color'],
      ['markerEnd', 'marker-end'],
      ['markerMid', 'marker-mid'],
      ['markerStart', 'marker-start'],
      ['overlinePosition', 'overline-position'],
      ['overlineThickness', 'overline-thickness'],
      ['paintOrder', 'paint-order'],
      ['panose-1', 'panose-1'],
      ['pointerEvents', 'pointer-events'],
      ['renderingIntent', 'rendering-intent'],
      ['shapeRendering', 'shape-rendering'],
      ['stopColor', 'stop-color'],
      ['stopOpacity', 'stop-opacity'],
      ['strikethroughPosition', 'strikethrough-position'],
      ['strikethroughThickness', 'strikethrough-thickness'],
      ['strokeDasharray', 'stroke-dasharray'],
      ['strokeDashoffset', 'stroke-dashoffset'],
      ['strokeLinecap', 'stroke-linecap'],
      ['strokeLinejoin', 'stroke-linejoin'],
      ['strokeMiterlimit', 'stroke-miterlimit'],
      ['strokeOpacity', 'stroke-opacity'],
      ['strokeWidth', 'stroke-width'],
      ['textAnchor', 'text-anchor'],
      ['textDecoration', 'text-decoration'],
      ['textRendering', 'text-rendering'],
      ['transformOrigin', 'transform-origin'],
      ['underlinePosition', 'underline-position'],
      ['underlineThickness', 'underline-thickness'],
      ['unicodeBidi', 'unicode-bidi'],
      ['unicodeRange', 'unicode-range'],
      ['unitsPerEm', 'units-per-em'],
      ['vAlphabetic', 'v-alphabetic'],
      ['vHanging', 'v-hanging'],
      ['vIdeographic', 'v-ideographic'],
      ['vMathematical', 'v-mathematical'],
      ['vectorEffect', 'vector-effect'],
      ['vertAdvY', 'vert-adv-y'],
      ['vertOriginX', 'vert-origin-x'],
      ['vertOriginY', 'vert-origin-y'],
      ['wordSpacing', 'word-spacing'],
      ['writingMode', 'writing-mode'],
      ['xmlnsXlink', 'xmlns:xlink'],
      ['xHeight', 'x-height'],
    ]),
    Mg =
      /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i
  function ds(e) {
    return Mg.test('' + e)
      ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')"
      : e
  }
  function hn() {}
  var pc = null
  function gc(e) {
    return (
      (e = e.target || e.srcElement || window),
      e.correspondingUseElement && (e = e.correspondingUseElement),
      e.nodeType === 3 ? e.parentNode : e
    )
  }
  var Xl = null,
    Jl = null
  function $o(e) {
    var t = Vl(e)
    if (t && (e = t.stateNode)) {
      var n = e[vt] || null
      e: switch (((e = t.stateNode), t.type)) {
        case 'input':
          if (
            (hc(e, n.value, n.defaultValue, n.defaultValue, n.checked, n.defaultChecked, n.type, n.name),
            (t = n.name),
            n.type === 'radio' && t != null)
          ) {
            for (n = e; n.parentNode; ) n = n.parentNode
            for (n = n.querySelectorAll('input[name="' + Ht('' + t) + '"][type="radio"]'), t = 0; t < n.length; t++) {
              var i = n[t]
              if (i !== e && i.form === e.form) {
                var r = i[vt] || null
                if (!r) throw Error(u(90))
                hc(i, r.value, r.defaultValue, r.defaultValue, r.checked, r.defaultChecked, r.type, r.name)
              }
            }
            for (t = 0; t < n.length; t++) ((i = n[t]), i.form === e.form && Ho(i))
          }
          break e
        case 'textarea':
          Zo(e, n.value, n.defaultValue)
          break e
        case 'select':
          ;((t = n.value), t != null && $l(e, !!n.multiple, t, !1))
      }
    }
  }
  var vc = !1
  function Qo(e, t, n) {
    if (vc) return e(t, n)
    vc = !0
    try {
      var i = e(t)
      return i
    } finally {
      if (((vc = !1), (Xl !== null || Jl !== null) && (Ps(), Xl && ((t = Xl), (e = Jl), (Jl = Xl = null), $o(t), e))))
        for (t = 0; t < e.length; t++) $o(e[t])
    }
  }
  function ei(e, t) {
    var n = e.stateNode
    if (n === null) return null
    var i = n[vt] || null
    if (i === null) return null
    n = i[t]
    e: switch (t) {
      case 'onClick':
      case 'onClickCapture':
      case 'onDoubleClick':
      case 'onDoubleClickCapture':
      case 'onMouseDown':
      case 'onMouseDownCapture':
      case 'onMouseMove':
      case 'onMouseMoveCapture':
      case 'onMouseUp':
      case 'onMouseUpCapture':
      case 'onMouseEnter':
        ;((i = !i.disabled) ||
          ((e = e.type), (i = !(e === 'button' || e === 'input' || e === 'select' || e === 'textarea'))),
          (e = !i))
        break e
      default:
        e = !1
    }
    if (e) return null
    if (n && typeof n != 'function') throw Error(u(231, t, typeof n))
    return n
  }
  var mn = !(typeof window > 'u' || typeof window.document > 'u' || typeof window.document.createElement > 'u'),
    bc = !1
  if (mn)
    try {
      var ti = {}
      ;(Object.defineProperty(ti, 'passive', {
        get: function () {
          bc = !0
        },
      }),
        window.addEventListener('test', ti, ti),
        window.removeEventListener('test', ti, ti))
    } catch {
      bc = !1
    }
  var Rn = null,
    Sc = null,
    hs = null
  function Xo() {
    if (hs) return hs
    var e,
      t = Sc,
      n = t.length,
      i,
      r = 'value' in Rn ? Rn.value : Rn.textContent,
      o = r.length
    for (e = 0; e < n && t[e] === r[e]; e++);
    var h = n - e
    for (i = 1; i <= h && t[n - i] === r[o - i]; i++);
    return (hs = r.slice(e, 1 < i ? 1 - i : void 0))
  }
  function ms(e) {
    var t = e.keyCode
    return (
      'charCode' in e ? ((e = e.charCode), e === 0 && t === 13 && (e = 13)) : (e = t),
      e === 10 && (e = 13),
      32 <= e || e === 13 ? e : 0
    )
  }
  function ys() {
    return !0
  }
  function Jo() {
    return !1
  }
  function bt(e) {
    function t(n, i, r, o, h) {
      ;((this._reactName = n),
        (this._targetInst = r),
        (this.type = i),
        (this.nativeEvent = o),
        (this.target = h),
        (this.currentTarget = null))
      for (var v in e) e.hasOwnProperty(v) && ((n = e[v]), (this[v] = n ? n(o) : o[v]))
      return (
        (this.isDefaultPrevented = (o.defaultPrevented != null ? o.defaultPrevented : o.returnValue === !1) ? ys : Jo),
        (this.isPropagationStopped = Jo),
        this
      )
    }
    return (
      S(t.prototype, {
        preventDefault: function () {
          this.defaultPrevented = !0
          var n = this.nativeEvent
          n &&
            (n.preventDefault ? n.preventDefault() : typeof n.returnValue != 'unknown' && (n.returnValue = !1),
            (this.isDefaultPrevented = ys))
        },
        stopPropagation: function () {
          var n = this.nativeEvent
          n &&
            (n.stopPropagation ? n.stopPropagation() : typeof n.cancelBubble != 'unknown' && (n.cancelBubble = !0),
            (this.isPropagationStopped = ys))
        },
        persist: function () {},
        isPersistent: ys,
      }),
      t
    )
  }
  var pl = {
      eventPhase: 0,
      bubbles: 0,
      cancelable: 0,
      timeStamp: function (e) {
        return e.timeStamp || Date.now()
      },
      defaultPrevented: 0,
      isTrusted: 0,
    },
    ps = bt(pl),
    ni = S({}, pl, { view: 0, detail: 0 }),
    Dg = bt(ni),
    _c,
    Tc,
    li,
    gs = S({}, ni, {
      screenX: 0,
      screenY: 0,
      clientX: 0,
      clientY: 0,
      pageX: 0,
      pageY: 0,
      ctrlKey: 0,
      shiftKey: 0,
      altKey: 0,
      metaKey: 0,
      getModifierState: xc,
      button: 0,
      buttons: 0,
      relatedTarget: function (e) {
        return e.relatedTarget === void 0
          ? e.fromElement === e.srcElement
            ? e.toElement
            : e.fromElement
          : e.relatedTarget
      },
      movementX: function (e) {
        return 'movementX' in e
          ? e.movementX
          : (e !== li &&
              (li && e.type === 'mousemove'
                ? ((_c = e.screenX - li.screenX), (Tc = e.screenY - li.screenY))
                : (Tc = _c = 0),
              (li = e)),
            _c)
      },
      movementY: function (e) {
        return 'movementY' in e ? e.movementY : Tc
      },
    }),
    Io = bt(gs),
    zg = S({}, gs, { dataTransfer: 0 }),
    Lg = bt(zg),
    Rg = S({}, ni, { relatedTarget: 0 }),
    Nc = bt(Rg),
    Ug = S({}, pl, { animationName: 0, elapsedTime: 0, pseudoElement: 0 }),
    Bg = bt(Ug),
    qg = S({}, pl, {
      clipboardData: function (e) {
        return 'clipboardData' in e ? e.clipboardData : window.clipboardData
      },
    }),
    Hg = bt(qg),
    Yg = S({}, pl, { data: 0 }),
    Wo = bt(Yg),
    Zg = {
      Esc: 'Escape',
      Spacebar: ' ',
      Left: 'ArrowLeft',
      Up: 'ArrowUp',
      Right: 'ArrowRight',
      Down: 'ArrowDown',
      Del: 'Delete',
      Win: 'OS',
      Menu: 'ContextMenu',
      Apps: 'ContextMenu',
      Scroll: 'ScrollLock',
      MozPrintableKey: 'Unidentified',
    },
    Vg = {
      8: 'Backspace',
      9: 'Tab',
      12: 'Clear',
      13: 'Enter',
      16: 'Shift',
      17: 'Control',
      18: 'Alt',
      19: 'Pause',
      20: 'CapsLock',
      27: 'Escape',
      32: ' ',
      33: 'PageUp',
      34: 'PageDown',
      35: 'End',
      36: 'Home',
      37: 'ArrowLeft',
      38: 'ArrowUp',
      39: 'ArrowRight',
      40: 'ArrowDown',
      45: 'Insert',
      46: 'Delete',
      112: 'F1',
      113: 'F2',
      114: 'F3',
      115: 'F4',
      116: 'F5',
      117: 'F6',
      118: 'F7',
      119: 'F8',
      120: 'F9',
      121: 'F10',
      122: 'F11',
      123: 'F12',
      144: 'NumLock',
      145: 'ScrollLock',
      224: 'Meta',
    },
    Kg = { Alt: 'altKey', Control: 'ctrlKey', Meta: 'metaKey', Shift: 'shiftKey' }
  function Gg(e) {
    var t = this.nativeEvent
    return t.getModifierState ? t.getModifierState(e) : (e = Kg[e]) ? !!t[e] : !1
  }
  function xc() {
    return Gg
  }
  var $g = S({}, ni, {
      key: function (e) {
        if (e.key) {
          var t = Zg[e.key] || e.key
          if (t !== 'Unidentified') return t
        }
        return e.type === 'keypress'
          ? ((e = ms(e)), e === 13 ? 'Enter' : String.fromCharCode(e))
          : e.type === 'keydown' || e.type === 'keyup'
            ? Vg[e.keyCode] || 'Unidentified'
            : ''
      },
      code: 0,
      location: 0,
      ctrlKey: 0,
      shiftKey: 0,
      altKey: 0,
      metaKey: 0,
      repeat: 0,
      locale: 0,
      getModifierState: xc,
      charCode: function (e) {
        return e.type === 'keypress' ? ms(e) : 0
      },
      keyCode: function (e) {
        return e.type === 'keydown' || e.type === 'keyup' ? e.keyCode : 0
      },
      which: function (e) {
        return e.type === 'keypress' ? ms(e) : e.type === 'keydown' || e.type === 'keyup' ? e.keyCode : 0
      },
    }),
    Qg = bt($g),
    Xg = S({}, gs, {
      pointerId: 0,
      width: 0,
      height: 0,
      pressure: 0,
      tangentialPressure: 0,
      tiltX: 0,
      tiltY: 0,
      twist: 0,
      pointerType: 0,
      isPrimary: 0,
    }),
    Fo = bt(Xg),
    Jg = S({}, ni, {
      touches: 0,
      targetTouches: 0,
      changedTouches: 0,
      altKey: 0,
      metaKey: 0,
      ctrlKey: 0,
      shiftKey: 0,
      getModifierState: xc,
    }),
    Ig = bt(Jg),
    Wg = S({}, pl, { propertyName: 0, elapsedTime: 0, pseudoElement: 0 }),
    Fg = bt(Wg),
    Pg = S({}, gs, {
      deltaX: function (e) {
        return 'deltaX' in e ? e.deltaX : 'wheelDeltaX' in e ? -e.wheelDeltaX : 0
      },
      deltaY: function (e) {
        return 'deltaY' in e ? e.deltaY : 'wheelDeltaY' in e ? -e.wheelDeltaY : 'wheelDelta' in e ? -e.wheelDelta : 0
      },
      deltaZ: 0,
      deltaMode: 0,
    }),
    ev = bt(Pg),
    tv = S({}, pl, { newState: 0, oldState: 0 }),
    nv = bt(tv),
    lv = [9, 13, 27, 32],
    Ec = mn && 'CompositionEvent' in window,
    ai = null
  mn && 'documentMode' in document && (ai = document.documentMode)
  var av = mn && 'TextEvent' in window && !ai,
    Po = mn && (!Ec || (ai && 8 < ai && 11 >= ai)),
    ed = ' ',
    td = !1
  function nd(e, t) {
    switch (e) {
      case 'keyup':
        return lv.indexOf(t.keyCode) !== -1
      case 'keydown':
        return t.keyCode !== 229
      case 'keypress':
      case 'mousedown':
      case 'focusout':
        return !0
      default:
        return !1
    }
  }
  function ld(e) {
    return ((e = e.detail), typeof e == 'object' && 'data' in e ? e.data : null)
  }
  var Il = !1
  function iv(e, t) {
    switch (e) {
      case 'compositionend':
        return ld(t)
      case 'keypress':
        return t.which !== 32 ? null : ((td = !0), ed)
      case 'textInput':
        return ((e = t.data), e === ed && td ? null : e)
      default:
        return null
    }
  }
  function sv(e, t) {
    if (Il)
      return e === 'compositionend' || (!Ec && nd(e, t)) ? ((e = Xo()), (hs = Sc = Rn = null), (Il = !1), e) : null
    switch (e) {
      case 'paste':
        return null
      case 'keypress':
        if (!(t.ctrlKey || t.altKey || t.metaKey) || (t.ctrlKey && t.altKey)) {
          if (t.char && 1 < t.char.length) return t.char
          if (t.which) return String.fromCharCode(t.which)
        }
        return null
      case 'compositionend':
        return Po && t.locale !== 'ko' ? null : t.data
      default:
        return null
    }
  }
  var uv = {
    'color': !0,
    'date': !0,
    'datetime': !0,
    'datetime-local': !0,
    'email': !0,
    'month': !0,
    'number': !0,
    'password': !0,
    'range': !0,
    'search': !0,
    'tel': !0,
    'text': !0,
    'time': !0,
    'url': !0,
    'week': !0,
  }
  function ad(e) {
    var t = e && e.nodeName && e.nodeName.toLowerCase()
    return t === 'input' ? !!uv[e.type] : t === 'textarea'
  }
  function id(e, t, n, i) {
    ;(Xl ? (Jl ? Jl.push(i) : (Jl = [i])) : (Xl = i),
      (t = su(t, 'onChange')),
      0 < t.length && ((n = new ps('onChange', 'change', null, n, i)), e.push({ event: n, listeners: t })))
  }
  var ii = null,
    si = null
  function cv(e) {
    Ym(e, 0)
  }
  function vs(e) {
    var t = Pa(e)
    if (Ho(t)) return e
  }
  function sd(e, t) {
    if (e === 'change') return t
  }
  var ud = !1
  if (mn) {
    var Ac
    if (mn) {
      var Oc = 'oninput' in document
      if (!Oc) {
        var cd = document.createElement('div')
        ;(cd.setAttribute('oninput', 'return;'), (Oc = typeof cd.oninput == 'function'))
      }
      Ac = Oc
    } else Ac = !1
    ud = Ac && (!document.documentMode || 9 < document.documentMode)
  }
  function rd() {
    ii && (ii.detachEvent('onpropertychange', fd), (si = ii = null))
  }
  function fd(e) {
    if (e.propertyName === 'value' && vs(si)) {
      var t = []
      ;(id(t, si, e, gc(e)), Qo(cv, t))
    }
  }
  function rv(e, t, n) {
    e === 'focusin' ? (rd(), (ii = t), (si = n), ii.attachEvent('onpropertychange', fd)) : e === 'focusout' && rd()
  }
  function fv(e) {
    if (e === 'selectionchange' || e === 'keyup' || e === 'keydown') return vs(si)
  }
  function ov(e, t) {
    if (e === 'click') return vs(t)
  }
  function dv(e, t) {
    if (e === 'input' || e === 'change') return vs(t)
  }
  function hv(e, t) {
    return (e === t && (e !== 0 || 1 / e === 1 / t)) || (e !== e && t !== t)
  }
  var Ct = typeof Object.is == 'function' ? Object.is : hv
  function ui(e, t) {
    if (Ct(e, t)) return !0
    if (typeof e != 'object' || e === null || typeof t != 'object' || t === null) return !1
    var n = Object.keys(e),
      i = Object.keys(t)
    if (n.length !== i.length) return !1
    for (i = 0; i < n.length; i++) {
      var r = n[i]
      if (!ac.call(t, r) || !Ct(e[r], t[r])) return !1
    }
    return !0
  }
  function od(e) {
    for (; e && e.firstChild; ) e = e.firstChild
    return e
  }
  function dd(e, t) {
    var n = od(e)
    e = 0
    for (var i; n; ) {
      if (n.nodeType === 3) {
        if (((i = e + n.textContent.length), e <= t && i >= t)) return { node: n, offset: t - e }
        e = i
      }
      e: {
        for (; n; ) {
          if (n.nextSibling) {
            n = n.nextSibling
            break e
          }
          n = n.parentNode
        }
        n = void 0
      }
      n = od(n)
    }
  }
  function hd(e, t) {
    return e && t
      ? e === t
        ? !0
        : e && e.nodeType === 3
          ? !1
          : t && t.nodeType === 3
            ? hd(e, t.parentNode)
            : 'contains' in e
              ? e.contains(t)
              : e.compareDocumentPosition
                ? !!(e.compareDocumentPosition(t) & 16)
                : !1
      : !1
  }
  function md(e) {
    e =
      e != null && e.ownerDocument != null && e.ownerDocument.defaultView != null ? e.ownerDocument.defaultView : window
    for (var t = os(e.document); t instanceof e.HTMLIFrameElement; ) {
      try {
        var n = typeof t.contentWindow.location.href == 'string'
      } catch {
        n = !1
      }
      if (n) e = t.contentWindow
      else break
      t = os(e.document)
    }
    return t
  }
  function jc(e) {
    var t = e && e.nodeName && e.nodeName.toLowerCase()
    return (
      t &&
      ((t === 'input' &&
        (e.type === 'text' || e.type === 'search' || e.type === 'tel' || e.type === 'url' || e.type === 'password')) ||
        t === 'textarea' ||
        e.contentEditable === 'true')
    )
  }
  var mv = mn && 'documentMode' in document && 11 >= document.documentMode,
    Wl = null,
    wc = null,
    ci = null,
    kc = !1
  function yd(e, t, n) {
    var i = n.window === n ? n.document : n.nodeType === 9 ? n : n.ownerDocument
    kc ||
      Wl == null ||
      Wl !== os(i) ||
      ((i = Wl),
      'selectionStart' in i && jc(i)
        ? (i = { start: i.selectionStart, end: i.selectionEnd })
        : ((i = ((i.ownerDocument && i.ownerDocument.defaultView) || window).getSelection()),
          (i = {
            anchorNode: i.anchorNode,
            anchorOffset: i.anchorOffset,
            focusNode: i.focusNode,
            focusOffset: i.focusOffset,
          })),
      (ci && ui(ci, i)) ||
        ((ci = i),
        (i = su(wc, 'onSelect')),
        0 < i.length &&
          ((t = new ps('onSelect', 'select', null, t, n)), e.push({ event: t, listeners: i }), (t.target = Wl))))
  }
  function gl(e, t) {
    var n = {}
    return ((n[e.toLowerCase()] = t.toLowerCase()), (n['Webkit' + e] = 'webkit' + t), (n['Moz' + e] = 'moz' + t), n)
  }
  var Fl = {
      animationend: gl('Animation', 'AnimationEnd'),
      animationiteration: gl('Animation', 'AnimationIteration'),
      animationstart: gl('Animation', 'AnimationStart'),
      transitionrun: gl('Transition', 'TransitionRun'),
      transitionstart: gl('Transition', 'TransitionStart'),
      transitioncancel: gl('Transition', 'TransitionCancel'),
      transitionend: gl('Transition', 'TransitionEnd'),
    },
    Cc = {},
    pd = {}
  mn &&
    ((pd = document.createElement('div').style),
    'AnimationEvent' in window ||
      (delete Fl.animationend.animation, delete Fl.animationiteration.animation, delete Fl.animationstart.animation),
    'TransitionEvent' in window || delete Fl.transitionend.transition)
  function vl(e) {
    if (Cc[e]) return Cc[e]
    if (!Fl[e]) return e
    var t = Fl[e],
      n
    for (n in t) if (t.hasOwnProperty(n) && n in pd) return (Cc[e] = t[n])
    return e
  }
  var gd = vl('animationend'),
    vd = vl('animationiteration'),
    bd = vl('animationstart'),
    yv = vl('transitionrun'),
    pv = vl('transitionstart'),
    gv = vl('transitioncancel'),
    Sd = vl('transitionend'),
    _d = new Map(),
    Mc =
      'abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel'.split(
        ' '
      )
  Mc.push('scrollEnd')
  function Ft(e, t) {
    ;(_d.set(e, t), yl(t, [e]))
  }
  var bs =
      typeof reportError == 'function'
        ? reportError
        : function (e) {
            if (typeof window == 'object' && typeof window.ErrorEvent == 'function') {
              var t = new window.ErrorEvent('error', {
                bubbles: !0,
                cancelable: !0,
                message:
                  typeof e == 'object' && e !== null && typeof e.message == 'string' ? String(e.message) : String(e),
                error: e,
              })
              if (!window.dispatchEvent(t)) return
            } else if (typeof process == 'object' && typeof process.emit == 'function') {
              process.emit('uncaughtException', e)
              return
            }
            console.error(e)
          },
    Yt = [],
    Pl = 0,
    Dc = 0
  function Ss() {
    for (var e = Pl, t = (Dc = Pl = 0); t < e; ) {
      var n = Yt[t]
      Yt[t++] = null
      var i = Yt[t]
      Yt[t++] = null
      var r = Yt[t]
      Yt[t++] = null
      var o = Yt[t]
      if (((Yt[t++] = null), i !== null && r !== null)) {
        var h = i.pending
        ;(h === null ? (r.next = r) : ((r.next = h.next), (h.next = r)), (i.pending = r))
      }
      o !== 0 && Td(n, r, o)
    }
  }
  function _s(e, t, n, i) {
    ;((Yt[Pl++] = e),
      (Yt[Pl++] = t),
      (Yt[Pl++] = n),
      (Yt[Pl++] = i),
      (Dc |= i),
      (e.lanes |= i),
      (e = e.alternate),
      e !== null && (e.lanes |= i))
  }
  function zc(e, t, n, i) {
    return (_s(e, t, n, i), Ts(e))
  }
  function bl(e, t) {
    return (_s(e, null, null, t), Ts(e))
  }
  function Td(e, t, n) {
    e.lanes |= n
    var i = e.alternate
    i !== null && (i.lanes |= n)
    for (var r = !1, o = e.return; o !== null; )
      ((o.childLanes |= n),
        (i = o.alternate),
        i !== null && (i.childLanes |= n),
        o.tag === 22 && ((e = o.stateNode), e === null || e._visibility & 1 || (r = !0)),
        (e = o),
        (o = o.return))
    return e.tag === 3
      ? ((o = e.stateNode),
        r &&
          t !== null &&
          ((r = 31 - kt(n)),
          (e = o.hiddenUpdates),
          (i = e[r]),
          i === null ? (e[r] = [t]) : i.push(t),
          (t.lane = n | 536870912)),
        o)
      : null
  }
  function Ts(e) {
    if (50 < ki) throw ((ki = 0), (Vr = null), Error(u(185)))
    for (var t = e.return; t !== null; ) ((e = t), (t = e.return))
    return e.tag === 3 ? e.stateNode : null
  }
  var ea = {}
  function vv(e, t, n, i) {
    ;((this.tag = e),
      (this.key = n),
      (this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null),
      (this.index = 0),
      (this.refCleanup = this.ref = null),
      (this.pendingProps = t),
      (this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null),
      (this.mode = i),
      (this.subtreeFlags = this.flags = 0),
      (this.deletions = null),
      (this.childLanes = this.lanes = 0),
      (this.alternate = null))
  }
  function Mt(e, t, n, i) {
    return new vv(e, t, n, i)
  }
  function Lc(e) {
    return ((e = e.prototype), !(!e || !e.isReactComponent))
  }
  function yn(e, t) {
    var n = e.alternate
    return (
      n === null
        ? ((n = Mt(e.tag, t, e.key, e.mode)),
          (n.elementType = e.elementType),
          (n.type = e.type),
          (n.stateNode = e.stateNode),
          (n.alternate = e),
          (e.alternate = n))
        : ((n.pendingProps = t), (n.type = e.type), (n.flags = 0), (n.subtreeFlags = 0), (n.deletions = null)),
      (n.flags = e.flags & 65011712),
      (n.childLanes = e.childLanes),
      (n.lanes = e.lanes),
      (n.child = e.child),
      (n.memoizedProps = e.memoizedProps),
      (n.memoizedState = e.memoizedState),
      (n.updateQueue = e.updateQueue),
      (t = e.dependencies),
      (n.dependencies = t === null ? null : { lanes: t.lanes, firstContext: t.firstContext }),
      (n.sibling = e.sibling),
      (n.index = e.index),
      (n.ref = e.ref),
      (n.refCleanup = e.refCleanup),
      n
    )
  }
  function Nd(e, t) {
    e.flags &= 65011714
    var n = e.alternate
    return (
      n === null
        ? ((e.childLanes = 0),
          (e.lanes = t),
          (e.child = null),
          (e.subtreeFlags = 0),
          (e.memoizedProps = null),
          (e.memoizedState = null),
          (e.updateQueue = null),
          (e.dependencies = null),
          (e.stateNode = null))
        : ((e.childLanes = n.childLanes),
          (e.lanes = n.lanes),
          (e.child = n.child),
          (e.subtreeFlags = 0),
          (e.deletions = null),
          (e.memoizedProps = n.memoizedProps),
          (e.memoizedState = n.memoizedState),
          (e.updateQueue = n.updateQueue),
          (e.type = n.type),
          (t = n.dependencies),
          (e.dependencies = t === null ? null : { lanes: t.lanes, firstContext: t.firstContext })),
      e
    )
  }
  function Ns(e, t, n, i, r, o) {
    var h = 0
    if (((i = e), typeof e == 'function')) Lc(e) && (h = 1)
    else if (typeof e == 'string') h = N0(e, n, ne.current) ? 26 : e === 'html' || e === 'head' || e === 'body' ? 27 : 5
    else
      e: switch (e) {
        case ce:
          return ((e = Mt(31, n, t, r)), (e.elementType = ce), (e.lanes = o), e)
        case A:
          return Sl(n.children, r, o, t)
        case M:
          ;((h = 8), (r |= 24))
          break
        case K:
          return ((e = Mt(12, n, t, r | 2)), (e.elementType = K), (e.lanes = o), e)
        case L:
          return ((e = Mt(13, n, t, r)), (e.elementType = L), (e.lanes = o), e)
        case $:
          return ((e = Mt(19, n, t, r)), (e.elementType = $), (e.lanes = o), e)
        default:
          if (typeof e == 'object' && e !== null)
            switch (e.$$typeof) {
              case I:
                h = 10
                break e
              case Z:
                h = 9
                break e
              case Y:
                h = 11
                break e
              case X:
                h = 14
                break e
              case G:
                ;((h = 16), (i = null))
                break e
            }
          ;((h = 29), (n = Error(u(130, e === null ? 'null' : typeof e, ''))), (i = null))
      }
    return ((t = Mt(h, n, t, r)), (t.elementType = e), (t.type = i), (t.lanes = o), t)
  }
  function Sl(e, t, n, i) {
    return ((e = Mt(7, e, i, t)), (e.lanes = n), e)
  }
  function Rc(e, t, n) {
    return ((e = Mt(6, e, null, t)), (e.lanes = n), e)
  }
  function xd(e) {
    var t = Mt(18, null, null, 0)
    return ((t.stateNode = e), t)
  }
  function Uc(e, t, n) {
    return (
      (t = Mt(4, e.children !== null ? e.children : [], e.key, t)),
      (t.lanes = n),
      (t.stateNode = { containerInfo: e.containerInfo, pendingChildren: null, implementation: e.implementation }),
      t
    )
  }
  var Ed = new WeakMap()
  function Zt(e, t) {
    if (typeof e == 'object' && e !== null) {
      var n = Ed.get(e)
      return n !== void 0 ? n : ((t = { value: e, source: t, stack: xo(t) }), Ed.set(e, t), t)
    }
    return { value: e, source: t, stack: xo(t) }
  }
  var ta = [],
    na = 0,
    xs = null,
    ri = 0,
    Vt = [],
    Kt = 0,
    Un = null,
    ln = 1,
    an = ''
  function pn(e, t) {
    ;((ta[na++] = ri), (ta[na++] = xs), (xs = e), (ri = t))
  }
  function Ad(e, t, n) {
    ;((Vt[Kt++] = ln), (Vt[Kt++] = an), (Vt[Kt++] = Un), (Un = e))
    var i = ln
    e = an
    var r = 32 - kt(i) - 1
    ;((i &= ~(1 << r)), (n += 1))
    var o = 32 - kt(t) + r
    if (30 < o) {
      var h = r - (r % 5)
      ;((o = (i & ((1 << h) - 1)).toString(32)),
        (i >>= h),
        (r -= h),
        (ln = (1 << (32 - kt(t) + r)) | (n << r) | i),
        (an = o + e))
    } else ((ln = (1 << o) | (n << r) | i), (an = e))
  }
  function Bc(e) {
    e.return !== null && (pn(e, 1), Ad(e, 1, 0))
  }
  function qc(e) {
    for (; e === xs; ) ((xs = ta[--na]), (ta[na] = null), (ri = ta[--na]), (ta[na] = null))
    for (; e === Un; )
      ((Un = Vt[--Kt]), (Vt[Kt] = null), (an = Vt[--Kt]), (Vt[Kt] = null), (ln = Vt[--Kt]), (Vt[Kt] = null))
  }
  function Od(e, t) {
    ;((Vt[Kt++] = ln), (Vt[Kt++] = an), (Vt[Kt++] = Un), (ln = t.id), (an = t.overflow), (Un = e))
  }
  var ut = null,
    Be = null,
    Ne = !1,
    Bn = null,
    Gt = !1,
    Hc = Error(u(519))
  function qn(e) {
    var t = Error(u(418, 1 < arguments.length && arguments[1] !== void 0 && arguments[1] ? 'text' : 'HTML', ''))
    throw (fi(Zt(t, e)), Hc)
  }
  function jd(e) {
    var t = e.stateNode,
      n = e.type,
      i = e.memoizedProps
    switch (((t[st] = e), (t[vt] = i), n)) {
      case 'dialog':
        ;(Se('cancel', t), Se('close', t))
        break
      case 'iframe':
      case 'object':
      case 'embed':
        Se('load', t)
        break
      case 'video':
      case 'audio':
        for (n = 0; n < Mi.length; n++) Se(Mi[n], t)
        break
      case 'source':
        Se('error', t)
        break
      case 'img':
      case 'image':
      case 'link':
        ;(Se('error', t), Se('load', t))
        break
      case 'details':
        Se('toggle', t)
        break
      case 'input':
        ;(Se('invalid', t), Yo(t, i.value, i.defaultValue, i.checked, i.defaultChecked, i.type, i.name, !0))
        break
      case 'select':
        Se('invalid', t)
        break
      case 'textarea':
        ;(Se('invalid', t), Vo(t, i.value, i.defaultValue, i.children))
    }
    ;((n = i.children),
      (typeof n != 'string' && typeof n != 'number' && typeof n != 'bigint') ||
      t.textContent === '' + n ||
      i.suppressHydrationWarning === !0 ||
      Gm(t.textContent, n)
        ? (i.popover != null && (Se('beforetoggle', t), Se('toggle', t)),
          i.onScroll != null && Se('scroll', t),
          i.onScrollEnd != null && Se('scrollend', t),
          i.onClick != null && (t.onclick = hn),
          (t = !0))
        : (t = !1),
      t || qn(e, !0))
  }
  function wd(e) {
    for (ut = e.return; ut; )
      switch (ut.tag) {
        case 5:
        case 31:
        case 13:
          Gt = !1
          return
        case 27:
        case 3:
          Gt = !0
          return
        default:
          ut = ut.return
      }
  }
  function la(e) {
    if (e !== ut) return !1
    if (!Ne) return (wd(e), (Ne = !0), !1)
    var t = e.tag,
      n
    if (
      ((n = t !== 3 && t !== 27) &&
        ((n = t === 5) && ((n = e.type), (n = !(n !== 'form' && n !== 'button') || af(e.type, e.memoizedProps))),
        (n = !n)),
      n && Be && qn(e),
      wd(e),
      t === 13)
    ) {
      if (((e = e.memoizedState), (e = e !== null ? e.dehydrated : null), !e)) throw Error(u(317))
      Be = ey(e)
    } else if (t === 31) {
      if (((e = e.memoizedState), (e = e !== null ? e.dehydrated : null), !e)) throw Error(u(317))
      Be = ey(e)
    } else
      t === 27
        ? ((t = Be), Pn(e.type) ? ((e = ff), (ff = null), (Be = e)) : (Be = t))
        : (Be = ut ? Qt(e.stateNode.nextSibling) : null)
    return !0
  }
  function _l() {
    ;((Be = ut = null), (Ne = !1))
  }
  function Yc() {
    var e = Bn
    return (e !== null && (Nt === null ? (Nt = e) : Nt.push.apply(Nt, e), (Bn = null)), e)
  }
  function fi(e) {
    Bn === null ? (Bn = [e]) : Bn.push(e)
  }
  var Zc = N(null),
    Tl = null,
    gn = null
  function Hn(e, t, n) {
    ;(J(Zc, t._currentValue), (t._currentValue = n))
  }
  function vn(e) {
    ;((e._currentValue = Zc.current), B(Zc))
  }
  function Vc(e, t, n) {
    for (; e !== null; ) {
      var i = e.alternate
      if (
        ((e.childLanes & t) !== t
          ? ((e.childLanes |= t), i !== null && (i.childLanes |= t))
          : i !== null && (i.childLanes & t) !== t && (i.childLanes |= t),
        e === n)
      )
        break
      e = e.return
    }
  }
  function Kc(e, t, n, i) {
    var r = e.child
    for (r !== null && (r.return = e); r !== null; ) {
      var o = r.dependencies
      if (o !== null) {
        var h = r.child
        o = o.firstContext
        e: for (; o !== null; ) {
          var v = o
          o = r
          for (var b = 0; b < t.length; b++)
            if (v.context === t[b]) {
              ;((o.lanes |= n), (v = o.alternate), v !== null && (v.lanes |= n), Vc(o.return, n, e), i || (h = null))
              break e
            }
          o = v.next
        }
      } else if (r.tag === 18) {
        if (((h = r.return), h === null)) throw Error(u(341))
        ;((h.lanes |= n), (o = h.alternate), o !== null && (o.lanes |= n), Vc(h, n, e), (h = null))
      } else h = r.child
      if (h !== null) h.return = r
      else
        for (h = r; h !== null; ) {
          if (h === e) {
            h = null
            break
          }
          if (((r = h.sibling), r !== null)) {
            ;((r.return = h.return), (h = r))
            break
          }
          h = h.return
        }
      r = h
    }
  }
  function aa(e, t, n, i) {
    e = null
    for (var r = t, o = !1; r !== null; ) {
      if (!o) {
        if ((r.flags & 524288) !== 0) o = !0
        else if ((r.flags & 262144) !== 0) break
      }
      if (r.tag === 10) {
        var h = r.alternate
        if (h === null) throw Error(u(387))
        if (((h = h.memoizedProps), h !== null)) {
          var v = r.type
          Ct(r.pendingProps.value, h.value) || (e !== null ? e.push(v) : (e = [v]))
        }
      } else if (r === we.current) {
        if (((h = r.alternate), h === null)) throw Error(u(387))
        h.memoizedState.memoizedState !== r.memoizedState.memoizedState && (e !== null ? e.push(Ui) : (e = [Ui]))
      }
      r = r.return
    }
    ;(e !== null && Kc(t, e, n, i), (t.flags |= 262144))
  }
  function Es(e) {
    for (e = e.firstContext; e !== null; ) {
      if (!Ct(e.context._currentValue, e.memoizedValue)) return !0
      e = e.next
    }
    return !1
  }
  function Nl(e) {
    ;((Tl = e), (gn = null), (e = e.dependencies), e !== null && (e.firstContext = null))
  }
  function ct(e) {
    return kd(Tl, e)
  }
  function As(e, t) {
    return (Tl === null && Nl(e), kd(e, t))
  }
  function kd(e, t) {
    var n = t._currentValue
    if (((t = { context: t, memoizedValue: n, next: null }), gn === null)) {
      if (e === null) throw Error(u(308))
      ;((gn = t), (e.dependencies = { lanes: 0, firstContext: t }), (e.flags |= 524288))
    } else gn = gn.next = t
    return n
  }
  var bv =
      typeof AbortController < 'u'
        ? AbortController
        : function () {
            var e = [],
              t = (this.signal = {
                aborted: !1,
                addEventListener: function (n, i) {
                  e.push(i)
                },
              })
            this.abort = function () {
              ;((t.aborted = !0),
                e.forEach(function (n) {
                  return n()
                }))
            }
          },
    Sv = s.unstable_scheduleCallback,
    _v = s.unstable_NormalPriority,
    Fe = { $$typeof: I, Consumer: null, Provider: null, _currentValue: null, _currentValue2: null, _threadCount: 0 }
  function Gc() {
    return { controller: new bv(), data: new Map(), refCount: 0 }
  }
  function oi(e) {
    ;(e.refCount--,
      e.refCount === 0 &&
        Sv(_v, function () {
          e.controller.abort()
        }))
  }
  var di = null,
    $c = 0,
    ia = 0,
    sa = null
  function Tv(e, t) {
    if (di === null) {
      var n = (di = [])
      ;(($c = 0),
        (ia = Jr()),
        (sa = {
          status: 'pending',
          value: void 0,
          then: function (i) {
            n.push(i)
          },
        }))
    }
    return ($c++, t.then(Cd, Cd), t)
  }
  function Cd() {
    if (--$c === 0 && di !== null) {
      sa !== null && (sa.status = 'fulfilled')
      var e = di
      ;((di = null), (ia = 0), (sa = null))
      for (var t = 0; t < e.length; t++) (0, e[t])()
    }
  }
  function Nv(e, t) {
    var n = [],
      i = {
        status: 'pending',
        value: null,
        reason: null,
        then: function (r) {
          n.push(r)
        },
      }
    return (
      e.then(
        function () {
          ;((i.status = 'fulfilled'), (i.value = t))
          for (var r = 0; r < n.length; r++) (0, n[r])(t)
        },
        function (r) {
          for (i.status = 'rejected', i.reason = r, r = 0; r < n.length; r++) (0, n[r])(void 0)
        }
      ),
      i
    )
  }
  var Md = z.S
  z.S = function (e, t) {
    ;((ym = jt()),
      typeof t == 'object' && t !== null && typeof t.then == 'function' && Tv(e, t),
      Md !== null && Md(e, t))
  }
  var xl = N(null)
  function Qc() {
    var e = xl.current
    return e !== null ? e : Re.pooledCache
  }
  function Os(e, t) {
    t === null ? J(xl, xl.current) : J(xl, t.pool)
  }
  function Dd() {
    var e = Qc()
    return e === null ? null : { parent: Fe._currentValue, pool: e }
  }
  var ua = Error(u(460)),
    Xc = Error(u(474)),
    js = Error(u(542)),
    ws = { then: function () {} }
  function zd(e) {
    return ((e = e.status), e === 'fulfilled' || e === 'rejected')
  }
  function Ld(e, t, n) {
    switch (((n = e[n]), n === void 0 ? e.push(t) : n !== t && (t.then(hn, hn), (t = n)), t.status)) {
      case 'fulfilled':
        return t.value
      case 'rejected':
        throw ((e = t.reason), Ud(e), e)
      default:
        if (typeof t.status == 'string') t.then(hn, hn)
        else {
          if (((e = Re), e !== null && 100 < e.shellSuspendCounter)) throw Error(u(482))
          ;((e = t),
            (e.status = 'pending'),
            e.then(
              function (i) {
                if (t.status === 'pending') {
                  var r = t
                  ;((r.status = 'fulfilled'), (r.value = i))
                }
              },
              function (i) {
                if (t.status === 'pending') {
                  var r = t
                  ;((r.status = 'rejected'), (r.reason = i))
                }
              }
            ))
        }
        switch (t.status) {
          case 'fulfilled':
            return t.value
          case 'rejected':
            throw ((e = t.reason), Ud(e), e)
        }
        throw ((Al = t), ua)
    }
  }
  function El(e) {
    try {
      var t = e._init
      return t(e._payload)
    } catch (n) {
      throw n !== null && typeof n == 'object' && typeof n.then == 'function' ? ((Al = n), ua) : n
    }
  }
  var Al = null
  function Rd() {
    if (Al === null) throw Error(u(459))
    var e = Al
    return ((Al = null), e)
  }
  function Ud(e) {
    if (e === ua || e === js) throw Error(u(483))
  }
  var ca = null,
    hi = 0
  function ks(e) {
    var t = hi
    return ((hi += 1), ca === null && (ca = []), Ld(ca, e, t))
  }
  function mi(e, t) {
    ;((t = t.props.ref), (e.ref = t !== void 0 ? t : null))
  }
  function Cs(e, t) {
    throw t.$$typeof === O
      ? Error(u(525))
      : ((e = Object.prototype.toString.call(t)),
        Error(u(31, e === '[object Object]' ? 'object with keys {' + Object.keys(t).join(', ') + '}' : e)))
  }
  function Bd(e) {
    function t(x, T) {
      if (e) {
        var j = x.deletions
        j === null ? ((x.deletions = [T]), (x.flags |= 16)) : j.push(T)
      }
    }
    function n(x, T) {
      if (!e) return null
      for (; T !== null; ) (t(x, T), (T = T.sibling))
      return null
    }
    function i(x) {
      for (var T = new Map(); x !== null; ) (x.key !== null ? T.set(x.key, x) : T.set(x.index, x), (x = x.sibling))
      return T
    }
    function r(x, T) {
      return ((x = yn(x, T)), (x.index = 0), (x.sibling = null), x)
    }
    function o(x, T, j) {
      return (
        (x.index = j),
        e
          ? ((j = x.alternate),
            j !== null ? ((j = j.index), j < T ? ((x.flags |= 67108866), T) : j) : ((x.flags |= 67108866), T))
          : ((x.flags |= 1048576), T)
      )
    }
    function h(x) {
      return (e && x.alternate === null && (x.flags |= 67108866), x)
    }
    function v(x, T, j, R) {
      return T === null || T.tag !== 6
        ? ((T = Rc(j, x.mode, R)), (T.return = x), T)
        : ((T = r(T, j)), (T.return = x), T)
    }
    function b(x, T, j, R) {
      var se = j.type
      return se === A
        ? D(x, T, j.props.children, R, j.key)
        : T !== null &&
            (T.elementType === se || (typeof se == 'object' && se !== null && se.$$typeof === G && El(se) === T.type))
          ? ((T = r(T, j.props)), mi(T, j), (T.return = x), T)
          : ((T = Ns(j.type, j.key, j.props, null, x.mode, R)), mi(T, j), (T.return = x), T)
    }
    function w(x, T, j, R) {
      return T === null ||
        T.tag !== 4 ||
        T.stateNode.containerInfo !== j.containerInfo ||
        T.stateNode.implementation !== j.implementation
        ? ((T = Uc(j, x.mode, R)), (T.return = x), T)
        : ((T = r(T, j.children || [])), (T.return = x), T)
    }
    function D(x, T, j, R, se) {
      return T === null || T.tag !== 7
        ? ((T = Sl(j, x.mode, R, se)), (T.return = x), T)
        : ((T = r(T, j)), (T.return = x), T)
    }
    function q(x, T, j) {
      if ((typeof T == 'string' && T !== '') || typeof T == 'number' || typeof T == 'bigint')
        return ((T = Rc('' + T, x.mode, j)), (T.return = x), T)
      if (typeof T == 'object' && T !== null) {
        switch (T.$$typeof) {
          case E:
            return ((j = Ns(T.type, T.key, T.props, null, x.mode, j)), mi(j, T), (j.return = x), j)
          case U:
            return ((T = Uc(T, x.mode, j)), (T.return = x), T)
          case G:
            return ((T = El(T)), q(x, T, j))
        }
        if (Ot(T) || F(T)) return ((T = Sl(T, x.mode, j, null)), (T.return = x), T)
        if (typeof T.then == 'function') return q(x, ks(T), j)
        if (T.$$typeof === I) return q(x, As(x, T), j)
        Cs(x, T)
      }
      return null
    }
    function k(x, T, j, R) {
      var se = T !== null ? T.key : null
      if ((typeof j == 'string' && j !== '') || typeof j == 'number' || typeof j == 'bigint')
        return se !== null ? null : v(x, T, '' + j, R)
      if (typeof j == 'object' && j !== null) {
        switch (j.$$typeof) {
          case E:
            return j.key === se ? b(x, T, j, R) : null
          case U:
            return j.key === se ? w(x, T, j, R) : null
          case G:
            return ((j = El(j)), k(x, T, j, R))
        }
        if (Ot(j) || F(j)) return se !== null ? null : D(x, T, j, R, null)
        if (typeof j.then == 'function') return k(x, T, ks(j), R)
        if (j.$$typeof === I) return k(x, T, As(x, j), R)
        Cs(x, j)
      }
      return null
    }
    function C(x, T, j, R, se) {
      if ((typeof R == 'string' && R !== '') || typeof R == 'number' || typeof R == 'bigint')
        return ((x = x.get(j) || null), v(T, x, '' + R, se))
      if (typeof R == 'object' && R !== null) {
        switch (R.$$typeof) {
          case E:
            return ((x = x.get(R.key === null ? j : R.key) || null), b(T, x, R, se))
          case U:
            return ((x = x.get(R.key === null ? j : R.key) || null), w(T, x, R, se))
          case G:
            return ((R = El(R)), C(x, T, j, R, se))
        }
        if (Ot(R) || F(R)) return ((x = x.get(j) || null), D(T, x, R, se, null))
        if (typeof R.then == 'function') return C(x, T, j, ks(R), se)
        if (R.$$typeof === I) return C(x, T, j, As(T, R), se)
        Cs(T, R)
      }
      return null
    }
    function ee(x, T, j, R) {
      for (var se = null, Ee = null, le = T, ye = (T = 0), Te = null; le !== null && ye < j.length; ye++) {
        le.index > ye ? ((Te = le), (le = null)) : (Te = le.sibling)
        var Ae = k(x, le, j[ye], R)
        if (Ae === null) {
          le === null && (le = Te)
          break
        }
        ;(e && le && Ae.alternate === null && t(x, le),
          (T = o(Ae, T, ye)),
          Ee === null ? (se = Ae) : (Ee.sibling = Ae),
          (Ee = Ae),
          (le = Te))
      }
      if (ye === j.length) return (n(x, le), Ne && pn(x, ye), se)
      if (le === null) {
        for (; ye < j.length; ye++)
          ((le = q(x, j[ye], R)),
            le !== null && ((T = o(le, T, ye)), Ee === null ? (se = le) : (Ee.sibling = le), (Ee = le)))
        return (Ne && pn(x, ye), se)
      }
      for (le = i(le); ye < j.length; ye++)
        ((Te = C(le, x, ye, j[ye], R)),
          Te !== null &&
            (e && Te.alternate !== null && le.delete(Te.key === null ? ye : Te.key),
            (T = o(Te, T, ye)),
            Ee === null ? (se = Te) : (Ee.sibling = Te),
            (Ee = Te)))
      return (
        e &&
          le.forEach(function (al) {
            return t(x, al)
          }),
        Ne && pn(x, ye),
        se
      )
    }
    function ue(x, T, j, R) {
      if (j == null) throw Error(u(151))
      for (
        var se = null, Ee = null, le = T, ye = (T = 0), Te = null, Ae = j.next();
        le !== null && !Ae.done;
        ye++, Ae = j.next()
      ) {
        le.index > ye ? ((Te = le), (le = null)) : (Te = le.sibling)
        var al = k(x, le, Ae.value, R)
        if (al === null) {
          le === null && (le = Te)
          break
        }
        ;(e && le && al.alternate === null && t(x, le),
          (T = o(al, T, ye)),
          Ee === null ? (se = al) : (Ee.sibling = al),
          (Ee = al),
          (le = Te))
      }
      if (Ae.done) return (n(x, le), Ne && pn(x, ye), se)
      if (le === null) {
        for (; !Ae.done; ye++, Ae = j.next())
          ((Ae = q(x, Ae.value, R)),
            Ae !== null && ((T = o(Ae, T, ye)), Ee === null ? (se = Ae) : (Ee.sibling = Ae), (Ee = Ae)))
        return (Ne && pn(x, ye), se)
      }
      for (le = i(le); !Ae.done; ye++, Ae = j.next())
        ((Ae = C(le, x, ye, Ae.value, R)),
          Ae !== null &&
            (e && Ae.alternate !== null && le.delete(Ae.key === null ? ye : Ae.key),
            (T = o(Ae, T, ye)),
            Ee === null ? (se = Ae) : (Ee.sibling = Ae),
            (Ee = Ae)))
      return (
        e &&
          le.forEach(function (z0) {
            return t(x, z0)
          }),
        Ne && pn(x, ye),
        se
      )
    }
    function Le(x, T, j, R) {
      if (
        (typeof j == 'object' && j !== null && j.type === A && j.key === null && (j = j.props.children),
        typeof j == 'object' && j !== null)
      ) {
        switch (j.$$typeof) {
          case E:
            e: {
              for (var se = j.key; T !== null; ) {
                if (T.key === se) {
                  if (((se = j.type), se === A)) {
                    if (T.tag === 7) {
                      ;(n(x, T.sibling), (R = r(T, j.props.children)), (R.return = x), (x = R))
                      break e
                    }
                  } else if (
                    T.elementType === se ||
                    (typeof se == 'object' && se !== null && se.$$typeof === G && El(se) === T.type)
                  ) {
                    ;(n(x, T.sibling), (R = r(T, j.props)), mi(R, j), (R.return = x), (x = R))
                    break e
                  }
                  n(x, T)
                  break
                } else t(x, T)
                T = T.sibling
              }
              j.type === A
                ? ((R = Sl(j.props.children, x.mode, R, j.key)), (R.return = x), (x = R))
                : ((R = Ns(j.type, j.key, j.props, null, x.mode, R)), mi(R, j), (R.return = x), (x = R))
            }
            return h(x)
          case U:
            e: {
              for (se = j.key; T !== null; ) {
                if (T.key === se)
                  if (
                    T.tag === 4 &&
                    T.stateNode.containerInfo === j.containerInfo &&
                    T.stateNode.implementation === j.implementation
                  ) {
                    ;(n(x, T.sibling), (R = r(T, j.children || [])), (R.return = x), (x = R))
                    break e
                  } else {
                    n(x, T)
                    break
                  }
                else t(x, T)
                T = T.sibling
              }
              ;((R = Uc(j, x.mode, R)), (R.return = x), (x = R))
            }
            return h(x)
          case G:
            return ((j = El(j)), Le(x, T, j, R))
        }
        if (Ot(j)) return ee(x, T, j, R)
        if (F(j)) {
          if (((se = F(j)), typeof se != 'function')) throw Error(u(150))
          return ((j = se.call(j)), ue(x, T, j, R))
        }
        if (typeof j.then == 'function') return Le(x, T, ks(j), R)
        if (j.$$typeof === I) return Le(x, T, As(x, j), R)
        Cs(x, j)
      }
      return (typeof j == 'string' && j !== '') || typeof j == 'number' || typeof j == 'bigint'
        ? ((j = '' + j),
          T !== null && T.tag === 6
            ? (n(x, T.sibling), (R = r(T, j)), (R.return = x), (x = R))
            : (n(x, T), (R = Rc(j, x.mode, R)), (R.return = x), (x = R)),
          h(x))
        : n(x, T)
    }
    return function (x, T, j, R) {
      try {
        hi = 0
        var se = Le(x, T, j, R)
        return ((ca = null), se)
      } catch (le) {
        if (le === ua || le === js) throw le
        var Ee = Mt(29, le, null, x.mode)
        return ((Ee.lanes = R), (Ee.return = x), Ee)
      } finally {
      }
    }
  }
  var Ol = Bd(!0),
    qd = Bd(!1),
    Yn = !1
  function Jc(e) {
    e.updateQueue = {
      baseState: e.memoizedState,
      firstBaseUpdate: null,
      lastBaseUpdate: null,
      shared: { pending: null, lanes: 0, hiddenCallbacks: null },
      callbacks: null,
    }
  }
  function Ic(e, t) {
    ;((e = e.updateQueue),
      t.updateQueue === e &&
        (t.updateQueue = {
          baseState: e.baseState,
          firstBaseUpdate: e.firstBaseUpdate,
          lastBaseUpdate: e.lastBaseUpdate,
          shared: e.shared,
          callbacks: null,
        }))
  }
  function Zn(e) {
    return { lane: e, tag: 0, payload: null, callback: null, next: null }
  }
  function Vn(e, t, n) {
    var i = e.updateQueue
    if (i === null) return null
    if (((i = i.shared), (je & 2) !== 0)) {
      var r = i.pending
      return (
        r === null ? (t.next = t) : ((t.next = r.next), (r.next = t)),
        (i.pending = t),
        (t = Ts(e)),
        Td(e, null, n),
        t
      )
    }
    return (_s(e, i, t, n), Ts(e))
  }
  function yi(e, t, n) {
    if (((t = t.updateQueue), t !== null && ((t = t.shared), (n & 4194048) !== 0))) {
      var i = t.lanes
      ;((i &= e.pendingLanes), (n |= i), (t.lanes = n), ko(e, n))
    }
  }
  function Wc(e, t) {
    var n = e.updateQueue,
      i = e.alternate
    if (i !== null && ((i = i.updateQueue), n === i)) {
      var r = null,
        o = null
      if (((n = n.firstBaseUpdate), n !== null)) {
        do {
          var h = { lane: n.lane, tag: n.tag, payload: n.payload, callback: null, next: null }
          ;(o === null ? (r = o = h) : (o = o.next = h), (n = n.next))
        } while (n !== null)
        o === null ? (r = o = t) : (o = o.next = t)
      } else r = o = t
      ;((n = {
        baseState: i.baseState,
        firstBaseUpdate: r,
        lastBaseUpdate: o,
        shared: i.shared,
        callbacks: i.callbacks,
      }),
        (e.updateQueue = n))
      return
    }
    ;((e = n.lastBaseUpdate), e === null ? (n.firstBaseUpdate = t) : (e.next = t), (n.lastBaseUpdate = t))
  }
  var Fc = !1
  function pi() {
    if (Fc) {
      var e = sa
      if (e !== null) throw e
    }
  }
  function gi(e, t, n, i) {
    Fc = !1
    var r = e.updateQueue
    Yn = !1
    var o = r.firstBaseUpdate,
      h = r.lastBaseUpdate,
      v = r.shared.pending
    if (v !== null) {
      r.shared.pending = null
      var b = v,
        w = b.next
      ;((b.next = null), h === null ? (o = w) : (h.next = w), (h = b))
      var D = e.alternate
      D !== null &&
        ((D = D.updateQueue),
        (v = D.lastBaseUpdate),
        v !== h && (v === null ? (D.firstBaseUpdate = w) : (v.next = w), (D.lastBaseUpdate = b)))
    }
    if (o !== null) {
      var q = r.baseState
      ;((h = 0), (D = w = b = null), (v = o))
      do {
        var k = v.lane & -536870913,
          C = k !== v.lane
        if (C ? (_e & k) === k : (i & k) === k) {
          ;(k !== 0 && k === ia && (Fc = !0),
            D !== null && (D = D.next = { lane: 0, tag: v.tag, payload: v.payload, callback: null, next: null }))
          e: {
            var ee = e,
              ue = v
            k = t
            var Le = n
            switch (ue.tag) {
              case 1:
                if (((ee = ue.payload), typeof ee == 'function')) {
                  q = ee.call(Le, q, k)
                  break e
                }
                q = ee
                break e
              case 3:
                ee.flags = (ee.flags & -65537) | 128
              case 0:
                if (((ee = ue.payload), (k = typeof ee == 'function' ? ee.call(Le, q, k) : ee), k == null)) break e
                q = S({}, q, k)
                break e
              case 2:
                Yn = !0
            }
          }
          ;((k = v.callback),
            k !== null &&
              ((e.flags |= 64),
              C && (e.flags |= 8192),
              (C = r.callbacks),
              C === null ? (r.callbacks = [k]) : C.push(k)))
        } else
          ((C = { lane: k, tag: v.tag, payload: v.payload, callback: v.callback, next: null }),
            D === null ? ((w = D = C), (b = q)) : (D = D.next = C),
            (h |= k))
        if (((v = v.next), v === null)) {
          if (((v = r.shared.pending), v === null)) break
          ;((C = v), (v = C.next), (C.next = null), (r.lastBaseUpdate = C), (r.shared.pending = null))
        }
      } while (!0)
      ;(D === null && (b = q),
        (r.baseState = b),
        (r.firstBaseUpdate = w),
        (r.lastBaseUpdate = D),
        o === null && (r.shared.lanes = 0),
        (Xn |= h),
        (e.lanes = h),
        (e.memoizedState = q))
    }
  }
  function Hd(e, t) {
    if (typeof e != 'function') throw Error(u(191, e))
    e.call(t)
  }
  function Yd(e, t) {
    var n = e.callbacks
    if (n !== null) for (e.callbacks = null, e = 0; e < n.length; e++) Hd(n[e], t)
  }
  var ra = N(null),
    Ms = N(0)
  function Zd(e, t) {
    ;((e = On), J(Ms, e), J(ra, t), (On = e | t.baseLanes))
  }
  function Pc() {
    ;(J(Ms, On), J(ra, ra.current))
  }
  function er() {
    ;((On = Ms.current), B(ra), B(Ms))
  }
  var Dt = N(null),
    $t = null
  function Kn(e) {
    var t = e.alternate
    ;(J(Je, Je.current & 1),
      J(Dt, e),
      $t === null && (t === null || ra.current !== null || t.memoizedState !== null) && ($t = e))
  }
  function tr(e) {
    ;(J(Je, Je.current), J(Dt, e), $t === null && ($t = e))
  }
  function Vd(e) {
    e.tag === 22 ? (J(Je, Je.current), J(Dt, e), $t === null && ($t = e)) : Gn()
  }
  function Gn() {
    ;(J(Je, Je.current), J(Dt, Dt.current))
  }
  function zt(e) {
    ;(B(Dt), $t === e && ($t = null), B(Je))
  }
  var Je = N(0)
  function Ds(e) {
    for (var t = e; t !== null; ) {
      if (t.tag === 13) {
        var n = t.memoizedState
        if (n !== null && ((n = n.dehydrated), n === null || cf(n) || rf(n))) return t
      } else if (
        t.tag === 19 &&
        (t.memoizedProps.revealOrder === 'forwards' ||
          t.memoizedProps.revealOrder === 'backwards' ||
          t.memoizedProps.revealOrder === 'unstable_legacy-backwards' ||
          t.memoizedProps.revealOrder === 'together')
      ) {
        if ((t.flags & 128) !== 0) return t
      } else if (t.child !== null) {
        ;((t.child.return = t), (t = t.child))
        continue
      }
      if (t === e) break
      for (; t.sibling === null; ) {
        if (t.return === null || t.return === e) return null
        t = t.return
      }
      ;((t.sibling.return = t.return), (t = t.sibling))
    }
    return null
  }
  var bn = 0,
    me = null,
    De = null,
    Pe = null,
    zs = !1,
    fa = !1,
    jl = !1,
    Ls = 0,
    vi = 0,
    oa = null,
    xv = 0
  function Ge() {
    throw Error(u(321))
  }
  function nr(e, t) {
    if (t === null) return !1
    for (var n = 0; n < t.length && n < e.length; n++) if (!Ct(e[n], t[n])) return !1
    return !0
  }
  function lr(e, t, n, i, r, o) {
    return (
      (bn = o),
      (me = t),
      (t.memoizedState = null),
      (t.updateQueue = null),
      (t.lanes = 0),
      (z.H = e === null || e.memoizedState === null ? Ah : vr),
      (jl = !1),
      (o = n(i, r)),
      (jl = !1),
      fa && (o = Gd(t, n, i, r)),
      Kd(e),
      o
    )
  }
  function Kd(e) {
    z.H = _i
    var t = De !== null && De.next !== null
    if (((bn = 0), (Pe = De = me = null), (zs = !1), (vi = 0), (oa = null), t)) throw Error(u(300))
    e === null || et || ((e = e.dependencies), e !== null && Es(e) && (et = !0))
  }
  function Gd(e, t, n, i) {
    me = e
    var r = 0
    do {
      if ((fa && (oa = null), (vi = 0), (fa = !1), 25 <= r)) throw Error(u(301))
      if (((r += 1), (Pe = De = null), e.updateQueue != null)) {
        var o = e.updateQueue
        ;((o.lastEffect = null), (o.events = null), (o.stores = null), o.memoCache != null && (o.memoCache.index = 0))
      }
      ;((z.H = Oh), (o = t(n, i)))
    } while (fa)
    return o
  }
  function Ev() {
    var e = z.H,
      t = e.useState()[0]
    return (
      (t = typeof t.then == 'function' ? bi(t) : t),
      (e = e.useState()[0]),
      (De !== null ? De.memoizedState : null) !== e && (me.flags |= 1024),
      t
    )
  }
  function ar() {
    var e = Ls !== 0
    return ((Ls = 0), e)
  }
  function ir(e, t, n) {
    ;((t.updateQueue = e.updateQueue), (t.flags &= -2053), (e.lanes &= ~n))
  }
  function sr(e) {
    if (zs) {
      for (e = e.memoizedState; e !== null; ) {
        var t = e.queue
        ;(t !== null && (t.pending = null), (e = e.next))
      }
      zs = !1
    }
    ;((bn = 0), (Pe = De = me = null), (fa = !1), (vi = Ls = 0), (oa = null))
  }
  function mt() {
    var e = { memoizedState: null, baseState: null, baseQueue: null, queue: null, next: null }
    return (Pe === null ? (me.memoizedState = Pe = e) : (Pe = Pe.next = e), Pe)
  }
  function Ie() {
    if (De === null) {
      var e = me.alternate
      e = e !== null ? e.memoizedState : null
    } else e = De.next
    var t = Pe === null ? me.memoizedState : Pe.next
    if (t !== null) ((Pe = t), (De = e))
    else {
      if (e === null) throw me.alternate === null ? Error(u(467)) : Error(u(310))
      ;((De = e),
        (e = {
          memoizedState: De.memoizedState,
          baseState: De.baseState,
          baseQueue: De.baseQueue,
          queue: De.queue,
          next: null,
        }),
        Pe === null ? (me.memoizedState = Pe = e) : (Pe = Pe.next = e))
    }
    return Pe
  }
  function Rs() {
    return { lastEffect: null, events: null, stores: null, memoCache: null }
  }
  function bi(e) {
    var t = vi
    return (
      (vi += 1),
      oa === null && (oa = []),
      (e = Ld(oa, e, t)),
      (t = me),
      (Pe === null ? t.memoizedState : Pe.next) === null &&
        ((t = t.alternate), (z.H = t === null || t.memoizedState === null ? Ah : vr)),
      e
    )
  }
  function Us(e) {
    if (e !== null && typeof e == 'object') {
      if (typeof e.then == 'function') return bi(e)
      if (e.$$typeof === I) return ct(e)
    }
    throw Error(u(438, String(e)))
  }
  function ur(e) {
    var t = null,
      n = me.updateQueue
    if ((n !== null && (t = n.memoCache), t == null)) {
      var i = me.alternate
      i !== null &&
        ((i = i.updateQueue),
        i !== null &&
          ((i = i.memoCache),
          i != null &&
            (t = {
              data: i.data.map(function (r) {
                return r.slice()
              }),
              index: 0,
            })))
    }
    if (
      (t == null && (t = { data: [], index: 0 }),
      n === null && ((n = Rs()), (me.updateQueue = n)),
      (n.memoCache = t),
      (n = t.data[t.index]),
      n === void 0)
    )
      for (n = t.data[t.index] = Array(e), i = 0; i < e; i++) n[i] = We
    return (t.index++, n)
  }
  function Sn(e, t) {
    return typeof t == 'function' ? t(e) : t
  }
  function Bs(e) {
    var t = Ie()
    return cr(t, De, e)
  }
  function cr(e, t, n) {
    var i = e.queue
    if (i === null) throw Error(u(311))
    i.lastRenderedReducer = n
    var r = e.baseQueue,
      o = i.pending
    if (o !== null) {
      if (r !== null) {
        var h = r.next
        ;((r.next = o.next), (o.next = h))
      }
      ;((t.baseQueue = r = o), (i.pending = null))
    }
    if (((o = e.baseState), r === null)) e.memoizedState = o
    else {
      t = r.next
      var v = (h = null),
        b = null,
        w = t,
        D = !1
      do {
        var q = w.lane & -536870913
        if (q !== w.lane ? (_e & q) === q : (bn & q) === q) {
          var k = w.revertLane
          if (k === 0)
            (b !== null &&
              (b = b.next =
                {
                  lane: 0,
                  revertLane: 0,
                  gesture: null,
                  action: w.action,
                  hasEagerState: w.hasEagerState,
                  eagerState: w.eagerState,
                  next: null,
                }),
              q === ia && (D = !0))
          else if ((bn & k) === k) {
            ;((w = w.next), k === ia && (D = !0))
            continue
          } else
            ((q = {
              lane: 0,
              revertLane: w.revertLane,
              gesture: null,
              action: w.action,
              hasEagerState: w.hasEagerState,
              eagerState: w.eagerState,
              next: null,
            }),
              b === null ? ((v = b = q), (h = o)) : (b = b.next = q),
              (me.lanes |= k),
              (Xn |= k))
          ;((q = w.action), jl && n(o, q), (o = w.hasEagerState ? w.eagerState : n(o, q)))
        } else
          ((k = {
            lane: q,
            revertLane: w.revertLane,
            gesture: w.gesture,
            action: w.action,
            hasEagerState: w.hasEagerState,
            eagerState: w.eagerState,
            next: null,
          }),
            b === null ? ((v = b = k), (h = o)) : (b = b.next = k),
            (me.lanes |= q),
            (Xn |= q))
        w = w.next
      } while (w !== null && w !== t)
      if ((b === null ? (h = o) : (b.next = v), !Ct(o, e.memoizedState) && ((et = !0), D && ((n = sa), n !== null))))
        throw n
      ;((e.memoizedState = o), (e.baseState = h), (e.baseQueue = b), (i.lastRenderedState = o))
    }
    return (r === null && (i.lanes = 0), [e.memoizedState, i.dispatch])
  }
  function rr(e) {
    var t = Ie(),
      n = t.queue
    if (n === null) throw Error(u(311))
    n.lastRenderedReducer = e
    var i = n.dispatch,
      r = n.pending,
      o = t.memoizedState
    if (r !== null) {
      n.pending = null
      var h = (r = r.next)
      do ((o = e(o, h.action)), (h = h.next))
      while (h !== r)
      ;(Ct(o, t.memoizedState) || (et = !0),
        (t.memoizedState = o),
        t.baseQueue === null && (t.baseState = o),
        (n.lastRenderedState = o))
    }
    return [o, i]
  }
  function $d(e, t, n) {
    var i = me,
      r = Ie(),
      o = Ne
    if (o) {
      if (n === void 0) throw Error(u(407))
      n = n()
    } else n = t()
    var h = !Ct((De || r).memoizedState, n)
    if (
      (h && ((r.memoizedState = n), (et = !0)),
      (r = r.queue),
      dr(Jd.bind(null, i, r, e), [e]),
      r.getSnapshot !== t || h || (Pe !== null && Pe.memoizedState.tag & 1))
    ) {
      if (((i.flags |= 2048), da(9, { destroy: void 0 }, Xd.bind(null, i, r, n, t), null), Re === null))
        throw Error(u(349))
      o || (bn & 127) !== 0 || Qd(i, t, n)
    }
    return n
  }
  function Qd(e, t, n) {
    ;((e.flags |= 16384),
      (e = { getSnapshot: t, value: n }),
      (t = me.updateQueue),
      t === null
        ? ((t = Rs()), (me.updateQueue = t), (t.stores = [e]))
        : ((n = t.stores), n === null ? (t.stores = [e]) : n.push(e)))
  }
  function Xd(e, t, n, i) {
    ;((t.value = n), (t.getSnapshot = i), Id(t) && Wd(e))
  }
  function Jd(e, t, n) {
    return n(function () {
      Id(t) && Wd(e)
    })
  }
  function Id(e) {
    var t = e.getSnapshot
    e = e.value
    try {
      var n = t()
      return !Ct(e, n)
    } catch {
      return !0
    }
  }
  function Wd(e) {
    var t = bl(e, 2)
    t !== null && xt(t, e, 2)
  }
  function fr(e) {
    var t = mt()
    if (typeof e == 'function') {
      var n = e
      if (((e = n()), jl)) {
        zn(!0)
        try {
          n()
        } finally {
          zn(!1)
        }
      }
    }
    return (
      (t.memoizedState = t.baseState = e),
      (t.queue = { pending: null, lanes: 0, dispatch: null, lastRenderedReducer: Sn, lastRenderedState: e }),
      t
    )
  }
  function Fd(e, t, n, i) {
    return ((e.baseState = n), cr(e, De, typeof i == 'function' ? i : Sn))
  }
  function Av(e, t, n, i, r) {
    if (Ys(e)) throw Error(u(485))
    if (((e = t.action), e !== null)) {
      var o = {
        payload: r,
        action: e,
        next: null,
        isTransition: !0,
        status: 'pending',
        value: null,
        reason: null,
        listeners: [],
        then: function (h) {
          o.listeners.push(h)
        },
      }
      ;(z.T !== null ? n(!0) : (o.isTransition = !1),
        i(o),
        (n = t.pending),
        n === null ? ((o.next = t.pending = o), Pd(t, o)) : ((o.next = n.next), (t.pending = n.next = o)))
    }
  }
  function Pd(e, t) {
    var n = t.action,
      i = t.payload,
      r = e.state
    if (t.isTransition) {
      var o = z.T,
        h = {}
      z.T = h
      try {
        var v = n(r, i),
          b = z.S
        ;(b !== null && b(h, v), eh(e, t, v))
      } catch (w) {
        or(e, t, w)
      } finally {
        ;(o !== null && h.types !== null && (o.types = h.types), (z.T = o))
      }
    } else
      try {
        ;((o = n(r, i)), eh(e, t, o))
      } catch (w) {
        or(e, t, w)
      }
  }
  function eh(e, t, n) {
    n !== null && typeof n == 'object' && typeof n.then == 'function'
      ? n.then(
          function (i) {
            th(e, t, i)
          },
          function (i) {
            return or(e, t, i)
          }
        )
      : th(e, t, n)
  }
  function th(e, t, n) {
    ;((t.status = 'fulfilled'),
      (t.value = n),
      nh(t),
      (e.state = n),
      (t = e.pending),
      t !== null && ((n = t.next), n === t ? (e.pending = null) : ((n = n.next), (t.next = n), Pd(e, n))))
  }
  function or(e, t, n) {
    var i = e.pending
    if (((e.pending = null), i !== null)) {
      i = i.next
      do ((t.status = 'rejected'), (t.reason = n), nh(t), (t = t.next))
      while (t !== i)
    }
    e.action = null
  }
  function nh(e) {
    e = e.listeners
    for (var t = 0; t < e.length; t++) (0, e[t])()
  }
  function lh(e, t) {
    return t
  }
  function ah(e, t) {
    if (Ne) {
      var n = Re.formState
      if (n !== null) {
        e: {
          var i = me
          if (Ne) {
            if (Be) {
              t: {
                for (var r = Be, o = Gt; r.nodeType !== 8; ) {
                  if (!o) {
                    r = null
                    break t
                  }
                  if (((r = Qt(r.nextSibling)), r === null)) {
                    r = null
                    break t
                  }
                }
                ;((o = r.data), (r = o === 'F!' || o === 'F' ? r : null))
              }
              if (r) {
                ;((Be = Qt(r.nextSibling)), (i = r.data === 'F!'))
                break e
              }
            }
            qn(i)
          }
          i = !1
        }
        i && (t = n[0])
      }
    }
    return (
      (n = mt()),
      (n.memoizedState = n.baseState = t),
      (i = { pending: null, lanes: 0, dispatch: null, lastRenderedReducer: lh, lastRenderedState: t }),
      (n.queue = i),
      (n = Nh.bind(null, me, i)),
      (i.dispatch = n),
      (i = fr(!1)),
      (o = gr.bind(null, me, !1, i.queue)),
      (i = mt()),
      (r = { state: t, dispatch: null, action: e, pending: null }),
      (i.queue = r),
      (n = Av.bind(null, me, r, o, n)),
      (r.dispatch = n),
      (i.memoizedState = e),
      [t, n, !1]
    )
  }
  function ih(e) {
    var t = Ie()
    return sh(t, De, e)
  }
  function sh(e, t, n) {
    if (((t = cr(e, t, lh)[0]), (e = Bs(Sn)[0]), typeof t == 'object' && t !== null && typeof t.then == 'function'))
      try {
        var i = bi(t)
      } catch (h) {
        throw h === ua ? js : h
      }
    else i = t
    t = Ie()
    var r = t.queue,
      o = r.dispatch
    return (
      n !== t.memoizedState && ((me.flags |= 2048), da(9, { destroy: void 0 }, Ov.bind(null, r, n), null)),
      [i, o, e]
    )
  }
  function Ov(e, t) {
    e.action = t
  }
  function uh(e) {
    var t = Ie(),
      n = De
    if (n !== null) return sh(t, n, e)
    ;(Ie(), (t = t.memoizedState), (n = Ie()))
    var i = n.queue.dispatch
    return ((n.memoizedState = e), [t, i, !1])
  }
  function da(e, t, n, i) {
    return (
      (e = { tag: e, create: n, deps: i, inst: t, next: null }),
      (t = me.updateQueue),
      t === null && ((t = Rs()), (me.updateQueue = t)),
      (n = t.lastEffect),
      n === null ? (t.lastEffect = e.next = e) : ((i = n.next), (n.next = e), (e.next = i), (t.lastEffect = e)),
      e
    )
  }
  function ch() {
    return Ie().memoizedState
  }
  function qs(e, t, n, i) {
    var r = mt()
    ;((me.flags |= e), (r.memoizedState = da(1 | t, { destroy: void 0 }, n, i === void 0 ? null : i)))
  }
  function Hs(e, t, n, i) {
    var r = Ie()
    i = i === void 0 ? null : i
    var o = r.memoizedState.inst
    De !== null && i !== null && nr(i, De.memoizedState.deps)
      ? (r.memoizedState = da(t, o, n, i))
      : ((me.flags |= e), (r.memoizedState = da(1 | t, o, n, i)))
  }
  function rh(e, t) {
    qs(8390656, 8, e, t)
  }
  function dr(e, t) {
    Hs(2048, 8, e, t)
  }
  function jv(e) {
    me.flags |= 4
    var t = me.updateQueue
    if (t === null) ((t = Rs()), (me.updateQueue = t), (t.events = [e]))
    else {
      var n = t.events
      n === null ? (t.events = [e]) : n.push(e)
    }
  }
  function fh(e) {
    var t = Ie().memoizedState
    return (
      jv({ ref: t, nextImpl: e }),
      function () {
        if ((je & 2) !== 0) throw Error(u(440))
        return t.impl.apply(void 0, arguments)
      }
    )
  }
  function oh(e, t) {
    return Hs(4, 2, e, t)
  }
  function dh(e, t) {
    return Hs(4, 4, e, t)
  }
  function hh(e, t) {
    if (typeof t == 'function') {
      e = e()
      var n = t(e)
      return function () {
        typeof n == 'function' ? n() : t(null)
      }
    }
    if (t != null)
      return (
        (e = e()),
        (t.current = e),
        function () {
          t.current = null
        }
      )
  }
  function mh(e, t, n) {
    ;((n = n != null ? n.concat([e]) : null), Hs(4, 4, hh.bind(null, t, e), n))
  }
  function hr() {}
  function yh(e, t) {
    var n = Ie()
    t = t === void 0 ? null : t
    var i = n.memoizedState
    return t !== null && nr(t, i[1]) ? i[0] : ((n.memoizedState = [e, t]), e)
  }
  function ph(e, t) {
    var n = Ie()
    t = t === void 0 ? null : t
    var i = n.memoizedState
    if (t !== null && nr(t, i[1])) return i[0]
    if (((i = e()), jl)) {
      zn(!0)
      try {
        e()
      } finally {
        zn(!1)
      }
    }
    return ((n.memoizedState = [i, t]), i)
  }
  function mr(e, t, n) {
    return n === void 0 || ((bn & 1073741824) !== 0 && (_e & 261930) === 0)
      ? (e.memoizedState = t)
      : ((e.memoizedState = n), (e = gm()), (me.lanes |= e), (Xn |= e), n)
  }
  function gh(e, t, n, i) {
    return Ct(n, t)
      ? n
      : ra.current !== null
        ? ((e = mr(e, n, i)), Ct(e, t) || (et = !0), e)
        : (bn & 42) === 0 || ((bn & 1073741824) !== 0 && (_e & 261930) === 0)
          ? ((et = !0), (e.memoizedState = n))
          : ((e = gm()), (me.lanes |= e), (Xn |= e), t)
  }
  function vh(e, t, n, i, r) {
    var o = Q.p
    Q.p = o !== 0 && 8 > o ? o : 8
    var h = z.T,
      v = {}
    ;((z.T = v), gr(e, !1, t, n))
    try {
      var b = r(),
        w = z.S
      if ((w !== null && w(v, b), b !== null && typeof b == 'object' && typeof b.then == 'function')) {
        var D = Nv(b, i)
        Si(e, t, D, Ut(e))
      } else Si(e, t, i, Ut(e))
    } catch (q) {
      Si(e, t, { then: function () {}, status: 'rejected', reason: q }, Ut())
    } finally {
      ;((Q.p = o), h !== null && v.types !== null && (h.types = v.types), (z.T = h))
    }
  }
  function wv() {}
  function yr(e, t, n, i) {
    if (e.tag !== 5) throw Error(u(476))
    var r = bh(e).queue
    vh(
      e,
      r,
      t,
      H,
      n === null
        ? wv
        : function () {
            return (Sh(e), n(i))
          }
    )
  }
  function bh(e) {
    var t = e.memoizedState
    if (t !== null) return t
    t = {
      memoizedState: H,
      baseState: H,
      baseQueue: null,
      queue: { pending: null, lanes: 0, dispatch: null, lastRenderedReducer: Sn, lastRenderedState: H },
      next: null,
    }
    var n = {}
    return (
      (t.next = {
        memoizedState: n,
        baseState: n,
        baseQueue: null,
        queue: { pending: null, lanes: 0, dispatch: null, lastRenderedReducer: Sn, lastRenderedState: n },
        next: null,
      }),
      (e.memoizedState = t),
      (e = e.alternate),
      e !== null && (e.memoizedState = t),
      t
    )
  }
  function Sh(e) {
    var t = bh(e)
    ;(t.next === null && (t = e.alternate.memoizedState), Si(e, t.next.queue, {}, Ut()))
  }
  function pr() {
    return ct(Ui)
  }
  function _h() {
    return Ie().memoizedState
  }
  function Th() {
    return Ie().memoizedState
  }
  function kv(e) {
    for (var t = e.return; t !== null; ) {
      switch (t.tag) {
        case 24:
        case 3:
          var n = Ut()
          e = Zn(n)
          var i = Vn(t, e, n)
          ;(i !== null && (xt(i, t, n), yi(i, t, n)), (t = { cache: Gc() }), (e.payload = t))
          return
      }
      t = t.return
    }
  }
  function Cv(e, t, n) {
    var i = Ut()
    ;((n = { lane: i, revertLane: 0, gesture: null, action: n, hasEagerState: !1, eagerState: null, next: null }),
      Ys(e) ? xh(t, n) : ((n = zc(e, t, n, i)), n !== null && (xt(n, e, i), Eh(n, t, i))))
  }
  function Nh(e, t, n) {
    var i = Ut()
    Si(e, t, n, i)
  }
  function Si(e, t, n, i) {
    var r = { lane: i, revertLane: 0, gesture: null, action: n, hasEagerState: !1, eagerState: null, next: null }
    if (Ys(e)) xh(t, r)
    else {
      var o = e.alternate
      if (e.lanes === 0 && (o === null || o.lanes === 0) && ((o = t.lastRenderedReducer), o !== null))
        try {
          var h = t.lastRenderedState,
            v = o(h, n)
          if (((r.hasEagerState = !0), (r.eagerState = v), Ct(v, h))) return (_s(e, t, r, 0), Re === null && Ss(), !1)
        } catch {
        } finally {
        }
      if (((n = zc(e, t, r, i)), n !== null)) return (xt(n, e, i), Eh(n, t, i), !0)
    }
    return !1
  }
  function gr(e, t, n, i) {
    if (
      ((i = { lane: 2, revertLane: Jr(), gesture: null, action: i, hasEagerState: !1, eagerState: null, next: null }),
      Ys(e))
    ) {
      if (t) throw Error(u(479))
    } else ((t = zc(e, n, i, 2)), t !== null && xt(t, e, 2))
  }
  function Ys(e) {
    var t = e.alternate
    return e === me || (t !== null && t === me)
  }
  function xh(e, t) {
    fa = zs = !0
    var n = e.pending
    ;(n === null ? (t.next = t) : ((t.next = n.next), (n.next = t)), (e.pending = t))
  }
  function Eh(e, t, n) {
    if ((n & 4194048) !== 0) {
      var i = t.lanes
      ;((i &= e.pendingLanes), (n |= i), (t.lanes = n), ko(e, n))
    }
  }
  var _i = {
    readContext: ct,
    use: Us,
    useCallback: Ge,
    useContext: Ge,
    useEffect: Ge,
    useImperativeHandle: Ge,
    useLayoutEffect: Ge,
    useInsertionEffect: Ge,
    useMemo: Ge,
    useReducer: Ge,
    useRef: Ge,
    useState: Ge,
    useDebugValue: Ge,
    useDeferredValue: Ge,
    useTransition: Ge,
    useSyncExternalStore: Ge,
    useId: Ge,
    useHostTransitionStatus: Ge,
    useFormState: Ge,
    useActionState: Ge,
    useOptimistic: Ge,
    useMemoCache: Ge,
    useCacheRefresh: Ge,
  }
  _i.useEffectEvent = Ge
  var Ah = {
      readContext: ct,
      use: Us,
      useCallback: function (e, t) {
        return ((mt().memoizedState = [e, t === void 0 ? null : t]), e)
      },
      useContext: ct,
      useEffect: rh,
      useImperativeHandle: function (e, t, n) {
        ;((n = n != null ? n.concat([e]) : null), qs(4194308, 4, hh.bind(null, t, e), n))
      },
      useLayoutEffect: function (e, t) {
        return qs(4194308, 4, e, t)
      },
      useInsertionEffect: function (e, t) {
        qs(4, 2, e, t)
      },
      useMemo: function (e, t) {
        var n = mt()
        t = t === void 0 ? null : t
        var i = e()
        if (jl) {
          zn(!0)
          try {
            e()
          } finally {
            zn(!1)
          }
        }
        return ((n.memoizedState = [i, t]), i)
      },
      useReducer: function (e, t, n) {
        var i = mt()
        if (n !== void 0) {
          var r = n(t)
          if (jl) {
            zn(!0)
            try {
              n(t)
            } finally {
              zn(!1)
            }
          }
        } else r = t
        return (
          (i.memoizedState = i.baseState = r),
          (e = { pending: null, lanes: 0, dispatch: null, lastRenderedReducer: e, lastRenderedState: r }),
          (i.queue = e),
          (e = e.dispatch = Cv.bind(null, me, e)),
          [i.memoizedState, e]
        )
      },
      useRef: function (e) {
        var t = mt()
        return ((e = { current: e }), (t.memoizedState = e))
      },
      useState: function (e) {
        e = fr(e)
        var t = e.queue,
          n = Nh.bind(null, me, t)
        return ((t.dispatch = n), [e.memoizedState, n])
      },
      useDebugValue: hr,
      useDeferredValue: function (e, t) {
        var n = mt()
        return mr(n, e, t)
      },
      useTransition: function () {
        var e = fr(!1)
        return ((e = vh.bind(null, me, e.queue, !0, !1)), (mt().memoizedState = e), [!1, e])
      },
      useSyncExternalStore: function (e, t, n) {
        var i = me,
          r = mt()
        if (Ne) {
          if (n === void 0) throw Error(u(407))
          n = n()
        } else {
          if (((n = t()), Re === null)) throw Error(u(349))
          ;(_e & 127) !== 0 || Qd(i, t, n)
        }
        r.memoizedState = n
        var o = { value: n, getSnapshot: t }
        return (
          (r.queue = o),
          rh(Jd.bind(null, i, o, e), [e]),
          (i.flags |= 2048),
          da(9, { destroy: void 0 }, Xd.bind(null, i, o, n, t), null),
          n
        )
      },
      useId: function () {
        var e = mt(),
          t = Re.identifierPrefix
        if (Ne) {
          var n = an,
            i = ln
          ;((n = (i & ~(1 << (32 - kt(i) - 1))).toString(32) + n),
            (t = '_' + t + 'R_' + n),
            (n = Ls++),
            0 < n && (t += 'H' + n.toString(32)),
            (t += '_'))
        } else ((n = xv++), (t = '_' + t + 'r_' + n.toString(32) + '_'))
        return (e.memoizedState = t)
      },
      useHostTransitionStatus: pr,
      useFormState: ah,
      useActionState: ah,
      useOptimistic: function (e) {
        var t = mt()
        t.memoizedState = t.baseState = e
        var n = { pending: null, lanes: 0, dispatch: null, lastRenderedReducer: null, lastRenderedState: null }
        return ((t.queue = n), (t = gr.bind(null, me, !0, n)), (n.dispatch = t), [e, t])
      },
      useMemoCache: ur,
      useCacheRefresh: function () {
        return (mt().memoizedState = kv.bind(null, me))
      },
      useEffectEvent: function (e) {
        var t = mt(),
          n = { impl: e }
        return (
          (t.memoizedState = n),
          function () {
            if ((je & 2) !== 0) throw Error(u(440))
            return n.impl.apply(void 0, arguments)
          }
        )
      },
    },
    vr = {
      readContext: ct,
      use: Us,
      useCallback: yh,
      useContext: ct,
      useEffect: dr,
      useImperativeHandle: mh,
      useInsertionEffect: oh,
      useLayoutEffect: dh,
      useMemo: ph,
      useReducer: Bs,
      useRef: ch,
      useState: function () {
        return Bs(Sn)
      },
      useDebugValue: hr,
      useDeferredValue: function (e, t) {
        var n = Ie()
        return gh(n, De.memoizedState, e, t)
      },
      useTransition: function () {
        var e = Bs(Sn)[0],
          t = Ie().memoizedState
        return [typeof e == 'boolean' ? e : bi(e), t]
      },
      useSyncExternalStore: $d,
      useId: _h,
      useHostTransitionStatus: pr,
      useFormState: ih,
      useActionState: ih,
      useOptimistic: function (e, t) {
        var n = Ie()
        return Fd(n, De, e, t)
      },
      useMemoCache: ur,
      useCacheRefresh: Th,
    }
  vr.useEffectEvent = fh
  var Oh = {
    readContext: ct,
    use: Us,
    useCallback: yh,
    useContext: ct,
    useEffect: dr,
    useImperativeHandle: mh,
    useInsertionEffect: oh,
    useLayoutEffect: dh,
    useMemo: ph,
    useReducer: rr,
    useRef: ch,
    useState: function () {
      return rr(Sn)
    },
    useDebugValue: hr,
    useDeferredValue: function (e, t) {
      var n = Ie()
      return De === null ? mr(n, e, t) : gh(n, De.memoizedState, e, t)
    },
    useTransition: function () {
      var e = rr(Sn)[0],
        t = Ie().memoizedState
      return [typeof e == 'boolean' ? e : bi(e), t]
    },
    useSyncExternalStore: $d,
    useId: _h,
    useHostTransitionStatus: pr,
    useFormState: uh,
    useActionState: uh,
    useOptimistic: function (e, t) {
      var n = Ie()
      return De !== null ? Fd(n, De, e, t) : ((n.baseState = e), [e, n.queue.dispatch])
    },
    useMemoCache: ur,
    useCacheRefresh: Th,
  }
  Oh.useEffectEvent = fh
  function br(e, t, n, i) {
    ;((t = e.memoizedState),
      (n = n(i, t)),
      (n = n == null ? t : S({}, t, n)),
      (e.memoizedState = n),
      e.lanes === 0 && (e.updateQueue.baseState = n))
  }
  var Sr = {
    enqueueSetState: function (e, t, n) {
      e = e._reactInternals
      var i = Ut(),
        r = Zn(i)
      ;((r.payload = t), n != null && (r.callback = n), (t = Vn(e, r, i)), t !== null && (xt(t, e, i), yi(t, e, i)))
    },
    enqueueReplaceState: function (e, t, n) {
      e = e._reactInternals
      var i = Ut(),
        r = Zn(i)
      ;((r.tag = 1),
        (r.payload = t),
        n != null && (r.callback = n),
        (t = Vn(e, r, i)),
        t !== null && (xt(t, e, i), yi(t, e, i)))
    },
    enqueueForceUpdate: function (e, t) {
      e = e._reactInternals
      var n = Ut(),
        i = Zn(n)
      ;((i.tag = 2), t != null && (i.callback = t), (t = Vn(e, i, n)), t !== null && (xt(t, e, n), yi(t, e, n)))
    },
  }
  function jh(e, t, n, i, r, o, h) {
    return (
      (e = e.stateNode),
      typeof e.shouldComponentUpdate == 'function'
        ? e.shouldComponentUpdate(i, o, h)
        : t.prototype && t.prototype.isPureReactComponent
          ? !ui(n, i) || !ui(r, o)
          : !0
    )
  }
  function wh(e, t, n, i) {
    ;((e = t.state),
      typeof t.componentWillReceiveProps == 'function' && t.componentWillReceiveProps(n, i),
      typeof t.UNSAFE_componentWillReceiveProps == 'function' && t.UNSAFE_componentWillReceiveProps(n, i),
      t.state !== e && Sr.enqueueReplaceState(t, t.state, null))
  }
  function wl(e, t) {
    var n = t
    if ('ref' in t) {
      n = {}
      for (var i in t) i !== 'ref' && (n[i] = t[i])
    }
    if ((e = e.defaultProps)) {
      n === t && (n = S({}, n))
      for (var r in e) n[r] === void 0 && (n[r] = e[r])
    }
    return n
  }
  function kh(e) {
    bs(e)
  }
  function Ch(e) {
    console.error(e)
  }
  function Mh(e) {
    bs(e)
  }
  function Zs(e, t) {
    try {
      var n = e.onUncaughtError
      n(t.value, { componentStack: t.stack })
    } catch (i) {
      setTimeout(function () {
        throw i
      })
    }
  }
  function Dh(e, t, n) {
    try {
      var i = e.onCaughtError
      i(n.value, { componentStack: n.stack, errorBoundary: t.tag === 1 ? t.stateNode : null })
    } catch (r) {
      setTimeout(function () {
        throw r
      })
    }
  }
  function _r(e, t, n) {
    return (
      (n = Zn(n)),
      (n.tag = 3),
      (n.payload = { element: null }),
      (n.callback = function () {
        Zs(e, t)
      }),
      n
    )
  }
  function zh(e) {
    return ((e = Zn(e)), (e.tag = 3), e)
  }
  function Lh(e, t, n, i) {
    var r = n.type.getDerivedStateFromError
    if (typeof r == 'function') {
      var o = i.value
      ;((e.payload = function () {
        return r(o)
      }),
        (e.callback = function () {
          Dh(t, n, i)
        }))
    }
    var h = n.stateNode
    h !== null &&
      typeof h.componentDidCatch == 'function' &&
      (e.callback = function () {
        ;(Dh(t, n, i), typeof r != 'function' && (Jn === null ? (Jn = new Set([this])) : Jn.add(this)))
        var v = i.stack
        this.componentDidCatch(i.value, { componentStack: v !== null ? v : '' })
      })
  }
  function Mv(e, t, n, i, r) {
    if (((n.flags |= 32768), i !== null && typeof i == 'object' && typeof i.then == 'function')) {
      if (((t = n.alternate), t !== null && aa(t, n, r, !0), (n = Dt.current), n !== null)) {
        switch (n.tag) {
          case 31:
          case 13:
            return (
              $t === null ? eu() : n.alternate === null && $e === 0 && ($e = 3),
              (n.flags &= -257),
              (n.flags |= 65536),
              (n.lanes = r),
              i === ws
                ? (n.flags |= 16384)
                : ((t = n.updateQueue), t === null ? (n.updateQueue = new Set([i])) : t.add(i), $r(e, i, r)),
              !1
            )
          case 22:
            return (
              (n.flags |= 65536),
              i === ws
                ? (n.flags |= 16384)
                : ((t = n.updateQueue),
                  t === null
                    ? ((t = { transitions: null, markerInstances: null, retryQueue: new Set([i]) }),
                      (n.updateQueue = t))
                    : ((n = t.retryQueue), n === null ? (t.retryQueue = new Set([i])) : n.add(i)),
                  $r(e, i, r)),
              !1
            )
        }
        throw Error(u(435, n.tag))
      }
      return ($r(e, i, r), eu(), !1)
    }
    if (Ne)
      return (
        (t = Dt.current),
        t !== null
          ? ((t.flags & 65536) === 0 && (t.flags |= 256),
            (t.flags |= 65536),
            (t.lanes = r),
            i !== Hc && ((e = Error(u(422), { cause: i })), fi(Zt(e, n))))
          : (i !== Hc && ((t = Error(u(423), { cause: i })), fi(Zt(t, n))),
            (e = e.current.alternate),
            (e.flags |= 65536),
            (r &= -r),
            (e.lanes |= r),
            (i = Zt(i, n)),
            (r = _r(e.stateNode, i, r)),
            Wc(e, r),
            $e !== 4 && ($e = 2)),
        !1
      )
    var o = Error(u(520), { cause: i })
    if (((o = Zt(o, n)), wi === null ? (wi = [o]) : wi.push(o), $e !== 4 && ($e = 2), t === null)) return !0
    ;((i = Zt(i, n)), (n = t))
    do {
      switch (n.tag) {
        case 3:
          return ((n.flags |= 65536), (e = r & -r), (n.lanes |= e), (e = _r(n.stateNode, i, e)), Wc(n, e), !1)
        case 1:
          if (
            ((t = n.type),
            (o = n.stateNode),
            (n.flags & 128) === 0 &&
              (typeof t.getDerivedStateFromError == 'function' ||
                (o !== null && typeof o.componentDidCatch == 'function' && (Jn === null || !Jn.has(o)))))
          )
            return ((n.flags |= 65536), (r &= -r), (n.lanes |= r), (r = zh(r)), Lh(r, e, n, i), Wc(n, r), !1)
      }
      n = n.return
    } while (n !== null)
    return !1
  }
  var Tr = Error(u(461)),
    et = !1
  function rt(e, t, n, i) {
    t.child = e === null ? qd(t, null, n, i) : Ol(t, e.child, n, i)
  }
  function Rh(e, t, n, i, r) {
    n = n.render
    var o = t.ref
    if ('ref' in i) {
      var h = {}
      for (var v in i) v !== 'ref' && (h[v] = i[v])
    } else h = i
    return (
      Nl(t),
      (i = lr(e, t, n, h, o, r)),
      (v = ar()),
      e !== null && !et ? (ir(e, t, r), _n(e, t, r)) : (Ne && v && Bc(t), (t.flags |= 1), rt(e, t, i, r), t.child)
    )
  }
  function Uh(e, t, n, i, r) {
    if (e === null) {
      var o = n.type
      return typeof o == 'function' && !Lc(o) && o.defaultProps === void 0 && n.compare === null
        ? ((t.tag = 15), (t.type = o), Bh(e, t, o, i, r))
        : ((e = Ns(n.type, null, i, t, t.mode, r)), (e.ref = t.ref), (e.return = t), (t.child = e))
    }
    if (((o = e.child), !kr(e, r))) {
      var h = o.memoizedProps
      if (((n = n.compare), (n = n !== null ? n : ui), n(h, i) && e.ref === t.ref)) return _n(e, t, r)
    }
    return ((t.flags |= 1), (e = yn(o, i)), (e.ref = t.ref), (e.return = t), (t.child = e))
  }
  function Bh(e, t, n, i, r) {
    if (e !== null) {
      var o = e.memoizedProps
      if (ui(o, i) && e.ref === t.ref)
        if (((et = !1), (t.pendingProps = i = o), kr(e, r))) (e.flags & 131072) !== 0 && (et = !0)
        else return ((t.lanes = e.lanes), _n(e, t, r))
    }
    return Nr(e, t, n, i, r)
  }
  function qh(e, t, n, i) {
    var r = i.children,
      o = e !== null ? e.memoizedState : null
    if (
      (e === null &&
        t.stateNode === null &&
        (t.stateNode = { _visibility: 1, _pendingMarkers: null, _retryCache: null, _transitions: null }),
      i.mode === 'hidden')
    ) {
      if ((t.flags & 128) !== 0) {
        if (((o = o !== null ? o.baseLanes | n : n), e !== null)) {
          for (i = t.child = e.child, r = 0; i !== null; ) ((r = r | i.lanes | i.childLanes), (i = i.sibling))
          i = r & ~o
        } else ((i = 0), (t.child = null))
        return Hh(e, t, o, n, i)
      }
      if ((n & 536870912) !== 0)
        ((t.memoizedState = { baseLanes: 0, cachePool: null }),
          e !== null && Os(t, o !== null ? o.cachePool : null),
          o !== null ? Zd(t, o) : Pc(),
          Vd(t))
      else return ((i = t.lanes = 536870912), Hh(e, t, o !== null ? o.baseLanes | n : n, n, i))
    } else
      o !== null
        ? (Os(t, o.cachePool), Zd(t, o), Gn(), (t.memoizedState = null))
        : (e !== null && Os(t, null), Pc(), Gn())
    return (rt(e, t, r, n), t.child)
  }
  function Ti(e, t) {
    return (
      (e !== null && e.tag === 22) ||
        t.stateNode !== null ||
        (t.stateNode = { _visibility: 1, _pendingMarkers: null, _retryCache: null, _transitions: null }),
      t.sibling
    )
  }
  function Hh(e, t, n, i, r) {
    var o = Qc()
    return (
      (o = o === null ? null : { parent: Fe._currentValue, pool: o }),
      (t.memoizedState = { baseLanes: n, cachePool: o }),
      e !== null && Os(t, null),
      Pc(),
      Vd(t),
      e !== null && aa(e, t, i, !0),
      (t.childLanes = r),
      null
    )
  }
  function Vs(e, t) {
    return ((t = Gs({ mode: t.mode, children: t.children }, e.mode)), (t.ref = e.ref), (e.child = t), (t.return = e), t)
  }
  function Yh(e, t, n) {
    return (Ol(t, e.child, null, n), (e = Vs(t, t.pendingProps)), (e.flags |= 2), zt(t), (t.memoizedState = null), e)
  }
  function Dv(e, t, n) {
    var i = t.pendingProps,
      r = (t.flags & 128) !== 0
    if (((t.flags &= -129), e === null)) {
      if (Ne) {
        if (i.mode === 'hidden') return ((e = Vs(t, i)), (t.lanes = 536870912), Ti(null, e))
        if (
          (tr(t),
          (e = Be)
            ? ((e = Pm(e, Gt)),
              (e = e !== null && e.data === '&' ? e : null),
              e !== null &&
                ((t.memoizedState = {
                  dehydrated: e,
                  treeContext: Un !== null ? { id: ln, overflow: an } : null,
                  retryLane: 536870912,
                  hydrationErrors: null,
                }),
                (n = xd(e)),
                (n.return = t),
                (t.child = n),
                (ut = t),
                (Be = null)))
            : (e = null),
          e === null)
        )
          throw qn(t)
        return ((t.lanes = 536870912), null)
      }
      return Vs(t, i)
    }
    var o = e.memoizedState
    if (o !== null) {
      var h = o.dehydrated
      if ((tr(t), r))
        if (t.flags & 256) ((t.flags &= -257), (t = Yh(e, t, n)))
        else if (t.memoizedState !== null) ((t.child = e.child), (t.flags |= 128), (t = null))
        else throw Error(u(558))
      else if ((et || aa(e, t, n, !1), (r = (n & e.childLanes) !== 0), et || r)) {
        if (((i = Re), i !== null && ((h = Co(i, n)), h !== 0 && h !== o.retryLane)))
          throw ((o.retryLane = h), bl(e, h), xt(i, e, h), Tr)
        ;(eu(), (t = Yh(e, t, n)))
      } else
        ((e = o.treeContext),
          (Be = Qt(h.nextSibling)),
          (ut = t),
          (Ne = !0),
          (Bn = null),
          (Gt = !1),
          e !== null && Od(t, e),
          (t = Vs(t, i)),
          (t.flags |= 4096))
      return t
    }
    return (
      (e = yn(e.child, { mode: i.mode, children: i.children })),
      (e.ref = t.ref),
      (t.child = e),
      (e.return = t),
      e
    )
  }
  function Ks(e, t) {
    var n = t.ref
    if (n === null) e !== null && e.ref !== null && (t.flags |= 4194816)
    else {
      if (typeof n != 'function' && typeof n != 'object') throw Error(u(284))
      ;(e === null || e.ref !== n) && (t.flags |= 4194816)
    }
  }
  function Nr(e, t, n, i, r) {
    return (
      Nl(t),
      (n = lr(e, t, n, i, void 0, r)),
      (i = ar()),
      e !== null && !et ? (ir(e, t, r), _n(e, t, r)) : (Ne && i && Bc(t), (t.flags |= 1), rt(e, t, n, r), t.child)
    )
  }
  function Zh(e, t, n, i, r, o) {
    return (
      Nl(t),
      (t.updateQueue = null),
      (n = Gd(t, i, n, r)),
      Kd(e),
      (i = ar()),
      e !== null && !et ? (ir(e, t, o), _n(e, t, o)) : (Ne && i && Bc(t), (t.flags |= 1), rt(e, t, n, o), t.child)
    )
  }
  function Vh(e, t, n, i, r) {
    if ((Nl(t), t.stateNode === null)) {
      var o = ea,
        h = n.contextType
      ;(typeof h == 'object' && h !== null && (o = ct(h)),
        (o = new n(i, o)),
        (t.memoizedState = o.state !== null && o.state !== void 0 ? o.state : null),
        (o.updater = Sr),
        (t.stateNode = o),
        (o._reactInternals = t),
        (o = t.stateNode),
        (o.props = i),
        (o.state = t.memoizedState),
        (o.refs = {}),
        Jc(t),
        (h = n.contextType),
        (o.context = typeof h == 'object' && h !== null ? ct(h) : ea),
        (o.state = t.memoizedState),
        (h = n.getDerivedStateFromProps),
        typeof h == 'function' && (br(t, n, h, i), (o.state = t.memoizedState)),
        typeof n.getDerivedStateFromProps == 'function' ||
          typeof o.getSnapshotBeforeUpdate == 'function' ||
          (typeof o.UNSAFE_componentWillMount != 'function' && typeof o.componentWillMount != 'function') ||
          ((h = o.state),
          typeof o.componentWillMount == 'function' && o.componentWillMount(),
          typeof o.UNSAFE_componentWillMount == 'function' && o.UNSAFE_componentWillMount(),
          h !== o.state && Sr.enqueueReplaceState(o, o.state, null),
          gi(t, i, o, r),
          pi(),
          (o.state = t.memoizedState)),
        typeof o.componentDidMount == 'function' && (t.flags |= 4194308),
        (i = !0))
    } else if (e === null) {
      o = t.stateNode
      var v = t.memoizedProps,
        b = wl(n, v)
      o.props = b
      var w = o.context,
        D = n.contextType
      ;((h = ea), typeof D == 'object' && D !== null && (h = ct(D)))
      var q = n.getDerivedStateFromProps
      ;((D = typeof q == 'function' || typeof o.getSnapshotBeforeUpdate == 'function'),
        (v = t.pendingProps !== v),
        D ||
          (typeof o.UNSAFE_componentWillReceiveProps != 'function' &&
            typeof o.componentWillReceiveProps != 'function') ||
          ((v || w !== h) && wh(t, o, i, h)),
        (Yn = !1))
      var k = t.memoizedState
      ;((o.state = k),
        gi(t, i, o, r),
        pi(),
        (w = t.memoizedState),
        v || k !== w || Yn
          ? (typeof q == 'function' && (br(t, n, q, i), (w = t.memoizedState)),
            (b = Yn || jh(t, n, b, i, k, w, h))
              ? (D ||
                  (typeof o.UNSAFE_componentWillMount != 'function' && typeof o.componentWillMount != 'function') ||
                  (typeof o.componentWillMount == 'function' && o.componentWillMount(),
                  typeof o.UNSAFE_componentWillMount == 'function' && o.UNSAFE_componentWillMount()),
                typeof o.componentDidMount == 'function' && (t.flags |= 4194308))
              : (typeof o.componentDidMount == 'function' && (t.flags |= 4194308),
                (t.memoizedProps = i),
                (t.memoizedState = w)),
            (o.props = i),
            (o.state = w),
            (o.context = h),
            (i = b))
          : (typeof o.componentDidMount == 'function' && (t.flags |= 4194308), (i = !1)))
    } else {
      ;((o = t.stateNode),
        Ic(e, t),
        (h = t.memoizedProps),
        (D = wl(n, h)),
        (o.props = D),
        (q = t.pendingProps),
        (k = o.context),
        (w = n.contextType),
        (b = ea),
        typeof w == 'object' && w !== null && (b = ct(w)),
        (v = n.getDerivedStateFromProps),
        (w = typeof v == 'function' || typeof o.getSnapshotBeforeUpdate == 'function') ||
          (typeof o.UNSAFE_componentWillReceiveProps != 'function' &&
            typeof o.componentWillReceiveProps != 'function') ||
          ((h !== q || k !== b) && wh(t, o, i, b)),
        (Yn = !1),
        (k = t.memoizedState),
        (o.state = k),
        gi(t, i, o, r),
        pi())
      var C = t.memoizedState
      h !== q || k !== C || Yn || (e !== null && e.dependencies !== null && Es(e.dependencies))
        ? (typeof v == 'function' && (br(t, n, v, i), (C = t.memoizedState)),
          (D = Yn || jh(t, n, D, i, k, C, b) || (e !== null && e.dependencies !== null && Es(e.dependencies)))
            ? (w ||
                (typeof o.UNSAFE_componentWillUpdate != 'function' && typeof o.componentWillUpdate != 'function') ||
                (typeof o.componentWillUpdate == 'function' && o.componentWillUpdate(i, C, b),
                typeof o.UNSAFE_componentWillUpdate == 'function' && o.UNSAFE_componentWillUpdate(i, C, b)),
              typeof o.componentDidUpdate == 'function' && (t.flags |= 4),
              typeof o.getSnapshotBeforeUpdate == 'function' && (t.flags |= 1024))
            : (typeof o.componentDidUpdate != 'function' ||
                (h === e.memoizedProps && k === e.memoizedState) ||
                (t.flags |= 4),
              typeof o.getSnapshotBeforeUpdate != 'function' ||
                (h === e.memoizedProps && k === e.memoizedState) ||
                (t.flags |= 1024),
              (t.memoizedProps = i),
              (t.memoizedState = C)),
          (o.props = i),
          (o.state = C),
          (o.context = b),
          (i = D))
        : (typeof o.componentDidUpdate != 'function' ||
            (h === e.memoizedProps && k === e.memoizedState) ||
            (t.flags |= 4),
          typeof o.getSnapshotBeforeUpdate != 'function' ||
            (h === e.memoizedProps && k === e.memoizedState) ||
            (t.flags |= 1024),
          (i = !1))
    }
    return (
      (o = i),
      Ks(e, t),
      (i = (t.flags & 128) !== 0),
      o || i
        ? ((o = t.stateNode),
          (n = i && typeof n.getDerivedStateFromError != 'function' ? null : o.render()),
          (t.flags |= 1),
          e !== null && i ? ((t.child = Ol(t, e.child, null, r)), (t.child = Ol(t, null, n, r))) : rt(e, t, n, r),
          (t.memoizedState = o.state),
          (e = t.child))
        : (e = _n(e, t, r)),
      e
    )
  }
  function Kh(e, t, n, i) {
    return (_l(), (t.flags |= 256), rt(e, t, n, i), t.child)
  }
  var xr = { dehydrated: null, treeContext: null, retryLane: 0, hydrationErrors: null }
  function Er(e) {
    return { baseLanes: e, cachePool: Dd() }
  }
  function Ar(e, t, n) {
    return ((e = e !== null ? e.childLanes & ~n : 0), t && (e |= Rt), e)
  }
  function Gh(e, t, n) {
    var i = t.pendingProps,
      r = !1,
      o = (t.flags & 128) !== 0,
      h
    if (
      ((h = o) || (h = e !== null && e.memoizedState === null ? !1 : (Je.current & 2) !== 0),
      h && ((r = !0), (t.flags &= -129)),
      (h = (t.flags & 32) !== 0),
      (t.flags &= -33),
      e === null)
    ) {
      if (Ne) {
        if (
          (r ? Kn(t) : Gn(),
          (e = Be)
            ? ((e = Pm(e, Gt)),
              (e = e !== null && e.data !== '&' ? e : null),
              e !== null &&
                ((t.memoizedState = {
                  dehydrated: e,
                  treeContext: Un !== null ? { id: ln, overflow: an } : null,
                  retryLane: 536870912,
                  hydrationErrors: null,
                }),
                (n = xd(e)),
                (n.return = t),
                (t.child = n),
                (ut = t),
                (Be = null)))
            : (e = null),
          e === null)
        )
          throw qn(t)
        return (rf(e) ? (t.lanes = 32) : (t.lanes = 536870912), null)
      }
      var v = i.children
      return (
        (i = i.fallback),
        r
          ? (Gn(),
            (r = t.mode),
            (v = Gs({ mode: 'hidden', children: v }, r)),
            (i = Sl(i, r, n, null)),
            (v.return = t),
            (i.return = t),
            (v.sibling = i),
            (t.child = v),
            (i = t.child),
            (i.memoizedState = Er(n)),
            (i.childLanes = Ar(e, h, n)),
            (t.memoizedState = xr),
            Ti(null, i))
          : (Kn(t), Or(t, v))
      )
    }
    var b = e.memoizedState
    if (b !== null && ((v = b.dehydrated), v !== null)) {
      if (o)
        t.flags & 256
          ? (Kn(t), (t.flags &= -257), (t = jr(e, t, n)))
          : t.memoizedState !== null
            ? (Gn(), (t.child = e.child), (t.flags |= 128), (t = null))
            : (Gn(),
              (v = i.fallback),
              (r = t.mode),
              (i = Gs({ mode: 'visible', children: i.children }, r)),
              (v = Sl(v, r, n, null)),
              (v.flags |= 2),
              (i.return = t),
              (v.return = t),
              (i.sibling = v),
              (t.child = i),
              Ol(t, e.child, null, n),
              (i = t.child),
              (i.memoizedState = Er(n)),
              (i.childLanes = Ar(e, h, n)),
              (t.memoizedState = xr),
              (t = Ti(null, i)))
      else if ((Kn(t), rf(v))) {
        if (((h = v.nextSibling && v.nextSibling.dataset), h)) var w = h.dgst
        ;((h = w),
          (i = Error(u(419))),
          (i.stack = ''),
          (i.digest = h),
          fi({ value: i, source: null, stack: null }),
          (t = jr(e, t, n)))
      } else if ((et || aa(e, t, n, !1), (h = (n & e.childLanes) !== 0), et || h)) {
        if (((h = Re), h !== null && ((i = Co(h, n)), i !== 0 && i !== b.retryLane)))
          throw ((b.retryLane = i), bl(e, i), xt(h, e, i), Tr)
        ;(cf(v) || eu(), (t = jr(e, t, n)))
      } else
        cf(v)
          ? ((t.flags |= 192), (t.child = e.child), (t = null))
          : ((e = b.treeContext),
            (Be = Qt(v.nextSibling)),
            (ut = t),
            (Ne = !0),
            (Bn = null),
            (Gt = !1),
            e !== null && Od(t, e),
            (t = Or(t, i.children)),
            (t.flags |= 4096))
      return t
    }
    return r
      ? (Gn(),
        (v = i.fallback),
        (r = t.mode),
        (b = e.child),
        (w = b.sibling),
        (i = yn(b, { mode: 'hidden', children: i.children })),
        (i.subtreeFlags = b.subtreeFlags & 65011712),
        w !== null ? (v = yn(w, v)) : ((v = Sl(v, r, n, null)), (v.flags |= 2)),
        (v.return = t),
        (i.return = t),
        (i.sibling = v),
        (t.child = i),
        Ti(null, i),
        (i = t.child),
        (v = e.child.memoizedState),
        v === null
          ? (v = Er(n))
          : ((r = v.cachePool),
            r !== null ? ((b = Fe._currentValue), (r = r.parent !== b ? { parent: b, pool: b } : r)) : (r = Dd()),
            (v = { baseLanes: v.baseLanes | n, cachePool: r })),
        (i.memoizedState = v),
        (i.childLanes = Ar(e, h, n)),
        (t.memoizedState = xr),
        Ti(e.child, i))
      : (Kn(t),
        (n = e.child),
        (e = n.sibling),
        (n = yn(n, { mode: 'visible', children: i.children })),
        (n.return = t),
        (n.sibling = null),
        e !== null && ((h = t.deletions), h === null ? ((t.deletions = [e]), (t.flags |= 16)) : h.push(e)),
        (t.child = n),
        (t.memoizedState = null),
        n)
  }
  function Or(e, t) {
    return ((t = Gs({ mode: 'visible', children: t }, e.mode)), (t.return = e), (e.child = t))
  }
  function Gs(e, t) {
    return ((e = Mt(22, e, null, t)), (e.lanes = 0), e)
  }
  function jr(e, t, n) {
    return (Ol(t, e.child, null, n), (e = Or(t, t.pendingProps.children)), (e.flags |= 2), (t.memoizedState = null), e)
  }
  function $h(e, t, n) {
    e.lanes |= t
    var i = e.alternate
    ;(i !== null && (i.lanes |= t), Vc(e.return, t, n))
  }
  function wr(e, t, n, i, r, o) {
    var h = e.memoizedState
    h === null
      ? (e.memoizedState = {
          isBackwards: t,
          rendering: null,
          renderingStartTime: 0,
          last: i,
          tail: n,
          tailMode: r,
          treeForkCount: o,
        })
      : ((h.isBackwards = t),
        (h.rendering = null),
        (h.renderingStartTime = 0),
        (h.last = i),
        (h.tail = n),
        (h.tailMode = r),
        (h.treeForkCount = o))
  }
  function Qh(e, t, n) {
    var i = t.pendingProps,
      r = i.revealOrder,
      o = i.tail
    i = i.children
    var h = Je.current,
      v = (h & 2) !== 0
    if (
      (v ? ((h = (h & 1) | 2), (t.flags |= 128)) : (h &= 1),
      J(Je, h),
      rt(e, t, i, n),
      (i = Ne ? ri : 0),
      !v && e !== null && (e.flags & 128) !== 0)
    )
      e: for (e = t.child; e !== null; ) {
        if (e.tag === 13) e.memoizedState !== null && $h(e, n, t)
        else if (e.tag === 19) $h(e, n, t)
        else if (e.child !== null) {
          ;((e.child.return = e), (e = e.child))
          continue
        }
        if (e === t) break e
        for (; e.sibling === null; ) {
          if (e.return === null || e.return === t) break e
          e = e.return
        }
        ;((e.sibling.return = e.return), (e = e.sibling))
      }
    switch (r) {
      case 'forwards':
        for (n = t.child, r = null; n !== null; )
          ((e = n.alternate), e !== null && Ds(e) === null && (r = n), (n = n.sibling))
        ;((n = r),
          n === null ? ((r = t.child), (t.child = null)) : ((r = n.sibling), (n.sibling = null)),
          wr(t, !1, r, n, o, i))
        break
      case 'backwards':
      case 'unstable_legacy-backwards':
        for (n = null, r = t.child, t.child = null; r !== null; ) {
          if (((e = r.alternate), e !== null && Ds(e) === null)) {
            t.child = r
            break
          }
          ;((e = r.sibling), (r.sibling = n), (n = r), (r = e))
        }
        wr(t, !0, n, null, o, i)
        break
      case 'together':
        wr(t, !1, null, null, void 0, i)
        break
      default:
        t.memoizedState = null
    }
    return t.child
  }
  function _n(e, t, n) {
    if ((e !== null && (t.dependencies = e.dependencies), (Xn |= t.lanes), (n & t.childLanes) === 0))
      if (e !== null) {
        if ((aa(e, t, n, !1), (n & t.childLanes) === 0)) return null
      } else return null
    if (e !== null && t.child !== e.child) throw Error(u(153))
    if (t.child !== null) {
      for (e = t.child, n = yn(e, e.pendingProps), t.child = n, n.return = t; e.sibling !== null; )
        ((e = e.sibling), (n = n.sibling = yn(e, e.pendingProps)), (n.return = t))
      n.sibling = null
    }
    return t.child
  }
  function kr(e, t) {
    return (e.lanes & t) !== 0 ? !0 : ((e = e.dependencies), !!(e !== null && Es(e)))
  }
  function zv(e, t, n) {
    switch (t.tag) {
      case 3:
        ;(ht(t, t.stateNode.containerInfo), Hn(t, Fe, e.memoizedState.cache), _l())
        break
      case 27:
      case 5:
        Xa(t)
        break
      case 4:
        ht(t, t.stateNode.containerInfo)
        break
      case 10:
        Hn(t, t.type, t.memoizedProps.value)
        break
      case 31:
        if (t.memoizedState !== null) return ((t.flags |= 128), tr(t), null)
        break
      case 13:
        var i = t.memoizedState
        if (i !== null)
          return i.dehydrated !== null
            ? (Kn(t), (t.flags |= 128), null)
            : (n & t.child.childLanes) !== 0
              ? Gh(e, t, n)
              : (Kn(t), (e = _n(e, t, n)), e !== null ? e.sibling : null)
        Kn(t)
        break
      case 19:
        var r = (e.flags & 128) !== 0
        if (((i = (n & t.childLanes) !== 0), i || (aa(e, t, n, !1), (i = (n & t.childLanes) !== 0)), r)) {
          if (i) return Qh(e, t, n)
          t.flags |= 128
        }
        if (
          ((r = t.memoizedState),
          r !== null && ((r.rendering = null), (r.tail = null), (r.lastEffect = null)),
          J(Je, Je.current),
          i)
        )
          break
        return null
      case 22:
        return ((t.lanes = 0), qh(e, t, n, t.pendingProps))
      case 24:
        Hn(t, Fe, e.memoizedState.cache)
    }
    return _n(e, t, n)
  }
  function Xh(e, t, n) {
    if (e !== null)
      if (e.memoizedProps !== t.pendingProps) et = !0
      else {
        if (!kr(e, n) && (t.flags & 128) === 0) return ((et = !1), zv(e, t, n))
        et = (e.flags & 131072) !== 0
      }
    else ((et = !1), Ne && (t.flags & 1048576) !== 0 && Ad(t, ri, t.index))
    switch (((t.lanes = 0), t.tag)) {
      case 16:
        e: {
          var i = t.pendingProps
          if (((e = El(t.elementType)), (t.type = e), typeof e == 'function'))
            Lc(e)
              ? ((i = wl(e, i)), (t.tag = 1), (t = Vh(null, t, e, i, n)))
              : ((t.tag = 0), (t = Nr(null, t, e, i, n)))
          else {
            if (e != null) {
              var r = e.$$typeof
              if (r === Y) {
                ;((t.tag = 11), (t = Rh(null, t, e, i, n)))
                break e
              } else if (r === X) {
                ;((t.tag = 14), (t = Uh(null, t, e, i, n)))
                break e
              }
            }
            throw ((t = At(e) || e), Error(u(306, t, '')))
          }
        }
        return t
      case 0:
        return Nr(e, t, t.type, t.pendingProps, n)
      case 1:
        return ((i = t.type), (r = wl(i, t.pendingProps)), Vh(e, t, i, r, n))
      case 3:
        e: {
          if ((ht(t, t.stateNode.containerInfo), e === null)) throw Error(u(387))
          i = t.pendingProps
          var o = t.memoizedState
          ;((r = o.element), Ic(e, t), gi(t, i, null, n))
          var h = t.memoizedState
          if (((i = h.cache), Hn(t, Fe, i), i !== o.cache && Kc(t, [Fe], n, !0), pi(), (i = h.element), o.isDehydrated))
            if (
              ((o = { element: i, isDehydrated: !1, cache: h.cache }),
              (t.updateQueue.baseState = o),
              (t.memoizedState = o),
              t.flags & 256)
            ) {
              t = Kh(e, t, i, n)
              break e
            } else if (i !== r) {
              ;((r = Zt(Error(u(424)), t)), fi(r), (t = Kh(e, t, i, n)))
              break e
            } else {
              switch (((e = t.stateNode.containerInfo), e.nodeType)) {
                case 9:
                  e = e.body
                  break
                default:
                  e = e.nodeName === 'HTML' ? e.ownerDocument.body : e
              }
              for (Be = Qt(e.firstChild), ut = t, Ne = !0, Bn = null, Gt = !0, n = qd(t, null, i, n), t.child = n; n; )
                ((n.flags = (n.flags & -3) | 4096), (n = n.sibling))
            }
          else {
            if ((_l(), i === r)) {
              t = _n(e, t, n)
              break e
            }
            rt(e, t, i, n)
          }
          t = t.child
        }
        return t
      case 26:
        return (
          Ks(e, t),
          e === null
            ? (n = iy(t.type, null, t.pendingProps, null))
              ? (t.memoizedState = n)
              : Ne ||
                ((n = t.type),
                (e = t.pendingProps),
                (i = uu(ve.current).createElement(n)),
                (i[st] = t),
                (i[vt] = e),
                ft(i, n, e),
                at(i),
                (t.stateNode = i))
            : (t.memoizedState = iy(t.type, e.memoizedProps, t.pendingProps, e.memoizedState)),
          null
        )
      case 27:
        return (
          Xa(t),
          e === null &&
            Ne &&
            ((i = t.stateNode = ny(t.type, t.pendingProps, ve.current)),
            (ut = t),
            (Gt = !0),
            (r = Be),
            Pn(t.type) ? ((ff = r), (Be = Qt(i.firstChild))) : (Be = r)),
          rt(e, t, t.pendingProps.children, n),
          Ks(e, t),
          e === null && (t.flags |= 4194304),
          t.child
        )
      case 5:
        return (
          e === null &&
            Ne &&
            ((r = i = Be) &&
              ((i = f0(i, t.type, t.pendingProps, Gt)),
              i !== null ? ((t.stateNode = i), (ut = t), (Be = Qt(i.firstChild)), (Gt = !1), (r = !0)) : (r = !1)),
            r || qn(t)),
          Xa(t),
          (r = t.type),
          (o = t.pendingProps),
          (h = e !== null ? e.memoizedProps : null),
          (i = o.children),
          af(r, o) ? (i = null) : h !== null && af(r, h) && (t.flags |= 32),
          t.memoizedState !== null && ((r = lr(e, t, Ev, null, null, n)), (Ui._currentValue = r)),
          Ks(e, t),
          rt(e, t, i, n),
          t.child
        )
      case 6:
        return (
          e === null &&
            Ne &&
            ((e = n = Be) &&
              ((n = o0(n, t.pendingProps, Gt)),
              n !== null ? ((t.stateNode = n), (ut = t), (Be = null), (e = !0)) : (e = !1)),
            e || qn(t)),
          null
        )
      case 13:
        return Gh(e, t, n)
      case 4:
        return (
          ht(t, t.stateNode.containerInfo),
          (i = t.pendingProps),
          e === null ? (t.child = Ol(t, null, i, n)) : rt(e, t, i, n),
          t.child
        )
      case 11:
        return Rh(e, t, t.type, t.pendingProps, n)
      case 7:
        return (rt(e, t, t.pendingProps, n), t.child)
      case 8:
        return (rt(e, t, t.pendingProps.children, n), t.child)
      case 12:
        return (rt(e, t, t.pendingProps.children, n), t.child)
      case 10:
        return ((i = t.pendingProps), Hn(t, t.type, i.value), rt(e, t, i.children, n), t.child)
      case 9:
        return (
          (r = t.type._context),
          (i = t.pendingProps.children),
          Nl(t),
          (r = ct(r)),
          (i = i(r)),
          (t.flags |= 1),
          rt(e, t, i, n),
          t.child
        )
      case 14:
        return Uh(e, t, t.type, t.pendingProps, n)
      case 15:
        return Bh(e, t, t.type, t.pendingProps, n)
      case 19:
        return Qh(e, t, n)
      case 31:
        return Dv(e, t, n)
      case 22:
        return qh(e, t, n, t.pendingProps)
      case 24:
        return (
          Nl(t),
          (i = ct(Fe)),
          e === null
            ? ((r = Qc()),
              r === null &&
                ((r = Re),
                (o = Gc()),
                (r.pooledCache = o),
                o.refCount++,
                o !== null && (r.pooledCacheLanes |= n),
                (r = o)),
              (t.memoizedState = { parent: i, cache: r }),
              Jc(t),
              Hn(t, Fe, r))
            : ((e.lanes & n) !== 0 && (Ic(e, t), gi(t, null, null, n), pi()),
              (r = e.memoizedState),
              (o = t.memoizedState),
              r.parent !== i
                ? ((r = { parent: i, cache: i }),
                  (t.memoizedState = r),
                  t.lanes === 0 && (t.memoizedState = t.updateQueue.baseState = r),
                  Hn(t, Fe, i))
                : ((i = o.cache), Hn(t, Fe, i), i !== r.cache && Kc(t, [Fe], n, !0))),
          rt(e, t, t.pendingProps.children, n),
          t.child
        )
      case 29:
        throw t.pendingProps
    }
    throw Error(u(156, t.tag))
  }
  function Tn(e) {
    e.flags |= 4
  }
  function Cr(e, t, n, i, r) {
    if (((t = (e.mode & 32) !== 0) && (t = !1), t)) {
      if (((e.flags |= 16777216), (r & 335544128) === r))
        if (e.stateNode.complete) e.flags |= 8192
        else if (_m()) e.flags |= 8192
        else throw ((Al = ws), Xc)
    } else e.flags &= -16777217
  }
  function Jh(e, t) {
    if (t.type !== 'stylesheet' || (t.state.loading & 4) !== 0) e.flags &= -16777217
    else if (((e.flags |= 16777216), !fy(t)))
      if (_m()) e.flags |= 8192
      else throw ((Al = ws), Xc)
  }
  function $s(e, t) {
    ;(t !== null && (e.flags |= 4),
      e.flags & 16384 && ((t = e.tag !== 22 ? jo() : 536870912), (e.lanes |= t), (pa |= t)))
  }
  function Ni(e, t) {
    if (!Ne)
      switch (e.tailMode) {
        case 'hidden':
          t = e.tail
          for (var n = null; t !== null; ) (t.alternate !== null && (n = t), (t = t.sibling))
          n === null ? (e.tail = null) : (n.sibling = null)
          break
        case 'collapsed':
          n = e.tail
          for (var i = null; n !== null; ) (n.alternate !== null && (i = n), (n = n.sibling))
          i === null ? (t || e.tail === null ? (e.tail = null) : (e.tail.sibling = null)) : (i.sibling = null)
      }
  }
  function qe(e) {
    var t = e.alternate !== null && e.alternate.child === e.child,
      n = 0,
      i = 0
    if (t)
      for (var r = e.child; r !== null; )
        ((n |= r.lanes | r.childLanes),
          (i |= r.subtreeFlags & 65011712),
          (i |= r.flags & 65011712),
          (r.return = e),
          (r = r.sibling))
    else
      for (r = e.child; r !== null; )
        ((n |= r.lanes | r.childLanes), (i |= r.subtreeFlags), (i |= r.flags), (r.return = e), (r = r.sibling))
    return ((e.subtreeFlags |= i), (e.childLanes = n), t)
  }
  function Lv(e, t, n) {
    var i = t.pendingProps
    switch ((qc(t), t.tag)) {
      case 16:
      case 15:
      case 0:
      case 11:
      case 7:
      case 8:
      case 12:
      case 9:
      case 14:
        return (qe(t), null)
      case 1:
        return (qe(t), null)
      case 3:
        return (
          (n = t.stateNode),
          (i = null),
          e !== null && (i = e.memoizedState.cache),
          t.memoizedState.cache !== i && (t.flags |= 2048),
          vn(Fe),
          Xe(),
          n.pendingContext && ((n.context = n.pendingContext), (n.pendingContext = null)),
          (e === null || e.child === null) &&
            (la(t)
              ? Tn(t)
              : e === null || (e.memoizedState.isDehydrated && (t.flags & 256) === 0) || ((t.flags |= 1024), Yc())),
          qe(t),
          null
        )
      case 26:
        var r = t.type,
          o = t.memoizedState
        return (
          e === null
            ? (Tn(t), o !== null ? (qe(t), Jh(t, o)) : (qe(t), Cr(t, r, null, i, n)))
            : o
              ? o !== e.memoizedState
                ? (Tn(t), qe(t), Jh(t, o))
                : (qe(t), (t.flags &= -16777217))
              : ((e = e.memoizedProps), e !== i && Tn(t), qe(t), Cr(t, r, e, i, n)),
          null
        )
      case 27:
        if ((ls(t), (n = ve.current), (r = t.type), e !== null && t.stateNode != null)) e.memoizedProps !== i && Tn(t)
        else {
          if (!i) {
            if (t.stateNode === null) throw Error(u(166))
            return (qe(t), null)
          }
          ;((e = ne.current), la(t) ? jd(t) : ((e = ny(r, i, n)), (t.stateNode = e), Tn(t)))
        }
        return (qe(t), null)
      case 5:
        if ((ls(t), (r = t.type), e !== null && t.stateNode != null)) e.memoizedProps !== i && Tn(t)
        else {
          if (!i) {
            if (t.stateNode === null) throw Error(u(166))
            return (qe(t), null)
          }
          if (((o = ne.current), la(t))) jd(t)
          else {
            var h = uu(ve.current)
            switch (o) {
              case 1:
                o = h.createElementNS('http://www.w3.org/2000/svg', r)
                break
              case 2:
                o = h.createElementNS('http://www.w3.org/1998/Math/MathML', r)
                break
              default:
                switch (r) {
                  case 'svg':
                    o = h.createElementNS('http://www.w3.org/2000/svg', r)
                    break
                  case 'math':
                    o = h.createElementNS('http://www.w3.org/1998/Math/MathML', r)
                    break
                  case 'script':
                    ;((o = h.createElement('div')),
                      (o.innerHTML = '<script><\/script>'),
                      (o = o.removeChild(o.firstChild)))
                    break
                  case 'select':
                    ;((o =
                      typeof i.is == 'string' ? h.createElement('select', { is: i.is }) : h.createElement('select')),
                      i.multiple ? (o.multiple = !0) : i.size && (o.size = i.size))
                    break
                  default:
                    o = typeof i.is == 'string' ? h.createElement(r, { is: i.is }) : h.createElement(r)
                }
            }
            ;((o[st] = t), (o[vt] = i))
            e: for (h = t.child; h !== null; ) {
              if (h.tag === 5 || h.tag === 6) o.appendChild(h.stateNode)
              else if (h.tag !== 4 && h.tag !== 27 && h.child !== null) {
                ;((h.child.return = h), (h = h.child))
                continue
              }
              if (h === t) break e
              for (; h.sibling === null; ) {
                if (h.return === null || h.return === t) break e
                h = h.return
              }
              ;((h.sibling.return = h.return), (h = h.sibling))
            }
            t.stateNode = o
            e: switch ((ft(o, r, i), r)) {
              case 'button':
              case 'input':
              case 'select':
              case 'textarea':
                i = !!i.autoFocus
                break e
              case 'img':
                i = !0
                break e
              default:
                i = !1
            }
            i && Tn(t)
          }
        }
        return (qe(t), Cr(t, t.type, e === null ? null : e.memoizedProps, t.pendingProps, n), null)
      case 6:
        if (e && t.stateNode != null) e.memoizedProps !== i && Tn(t)
        else {
          if (typeof i != 'string' && t.stateNode === null) throw Error(u(166))
          if (((e = ve.current), la(t))) {
            if (((e = t.stateNode), (n = t.memoizedProps), (i = null), (r = ut), r !== null))
              switch (r.tag) {
                case 27:
                case 5:
                  i = r.memoizedProps
              }
            ;((e[st] = t),
              (e = !!(e.nodeValue === n || (i !== null && i.suppressHydrationWarning === !0) || Gm(e.nodeValue, n))),
              e || qn(t, !0))
          } else ((e = uu(e).createTextNode(i)), (e[st] = t), (t.stateNode = e))
        }
        return (qe(t), null)
      case 31:
        if (((n = t.memoizedState), e === null || e.memoizedState !== null)) {
          if (((i = la(t)), n !== null)) {
            if (e === null) {
              if (!i) throw Error(u(318))
              if (((e = t.memoizedState), (e = e !== null ? e.dehydrated : null), !e)) throw Error(u(557))
              e[st] = t
            } else (_l(), (t.flags & 128) === 0 && (t.memoizedState = null), (t.flags |= 4))
            ;(qe(t), (e = !1))
          } else ((n = Yc()), e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = n), (e = !0))
          if (!e) return t.flags & 256 ? (zt(t), t) : (zt(t), null)
          if ((t.flags & 128) !== 0) throw Error(u(558))
        }
        return (qe(t), null)
      case 13:
        if (((i = t.memoizedState), e === null || (e.memoizedState !== null && e.memoizedState.dehydrated !== null))) {
          if (((r = la(t)), i !== null && i.dehydrated !== null)) {
            if (e === null) {
              if (!r) throw Error(u(318))
              if (((r = t.memoizedState), (r = r !== null ? r.dehydrated : null), !r)) throw Error(u(317))
              r[st] = t
            } else (_l(), (t.flags & 128) === 0 && (t.memoizedState = null), (t.flags |= 4))
            ;(qe(t), (r = !1))
          } else ((r = Yc()), e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = r), (r = !0))
          if (!r) return t.flags & 256 ? (zt(t), t) : (zt(t), null)
        }
        return (
          zt(t),
          (t.flags & 128) !== 0
            ? ((t.lanes = n), t)
            : ((n = i !== null),
              (e = e !== null && e.memoizedState !== null),
              n &&
                ((i = t.child),
                (r = null),
                i.alternate !== null &&
                  i.alternate.memoizedState !== null &&
                  i.alternate.memoizedState.cachePool !== null &&
                  (r = i.alternate.memoizedState.cachePool.pool),
                (o = null),
                i.memoizedState !== null && i.memoizedState.cachePool !== null && (o = i.memoizedState.cachePool.pool),
                o !== r && (i.flags |= 2048)),
              n !== e && n && (t.child.flags |= 8192),
              $s(t, t.updateQueue),
              qe(t),
              null)
        )
      case 4:
        return (Xe(), e === null && Pr(t.stateNode.containerInfo), qe(t), null)
      case 10:
        return (vn(t.type), qe(t), null)
      case 19:
        if ((B(Je), (i = t.memoizedState), i === null)) return (qe(t), null)
        if (((r = (t.flags & 128) !== 0), (o = i.rendering), o === null))
          if (r) Ni(i, !1)
          else {
            if ($e !== 0 || (e !== null && (e.flags & 128) !== 0))
              for (e = t.child; e !== null; ) {
                if (((o = Ds(e)), o !== null)) {
                  for (
                    t.flags |= 128,
                      Ni(i, !1),
                      e = o.updateQueue,
                      t.updateQueue = e,
                      $s(t, e),
                      t.subtreeFlags = 0,
                      e = n,
                      n = t.child;
                    n !== null;

                  )
                    (Nd(n, e), (n = n.sibling))
                  return (J(Je, (Je.current & 1) | 2), Ne && pn(t, i.treeForkCount), t.child)
                }
                e = e.sibling
              }
            i.tail !== null && jt() > Ws && ((t.flags |= 128), (r = !0), Ni(i, !1), (t.lanes = 4194304))
          }
        else {
          if (!r)
            if (((e = Ds(o)), e !== null)) {
              if (
                ((t.flags |= 128),
                (r = !0),
                (e = e.updateQueue),
                (t.updateQueue = e),
                $s(t, e),
                Ni(i, !0),
                i.tail === null && i.tailMode === 'hidden' && !o.alternate && !Ne)
              )
                return (qe(t), null)
            } else
              2 * jt() - i.renderingStartTime > Ws &&
                n !== 536870912 &&
                ((t.flags |= 128), (r = !0), Ni(i, !1), (t.lanes = 4194304))
          i.isBackwards
            ? ((o.sibling = t.child), (t.child = o))
            : ((e = i.last), e !== null ? (e.sibling = o) : (t.child = o), (i.last = o))
        }
        return i.tail !== null
          ? ((e = i.tail),
            (i.rendering = e),
            (i.tail = e.sibling),
            (i.renderingStartTime = jt()),
            (e.sibling = null),
            (n = Je.current),
            J(Je, r ? (n & 1) | 2 : n & 1),
            Ne && pn(t, i.treeForkCount),
            e)
          : (qe(t), null)
      case 22:
      case 23:
        return (
          zt(t),
          er(),
          (i = t.memoizedState !== null),
          e !== null ? (e.memoizedState !== null) !== i && (t.flags |= 8192) : i && (t.flags |= 8192),
          i
            ? (n & 536870912) !== 0 && (t.flags & 128) === 0 && (qe(t), t.subtreeFlags & 6 && (t.flags |= 8192))
            : qe(t),
          (n = t.updateQueue),
          n !== null && $s(t, n.retryQueue),
          (n = null),
          e !== null &&
            e.memoizedState !== null &&
            e.memoizedState.cachePool !== null &&
            (n = e.memoizedState.cachePool.pool),
          (i = null),
          t.memoizedState !== null && t.memoizedState.cachePool !== null && (i = t.memoizedState.cachePool.pool),
          i !== n && (t.flags |= 2048),
          e !== null && B(xl),
          null
        )
      case 24:
        return (
          (n = null),
          e !== null && (n = e.memoizedState.cache),
          t.memoizedState.cache !== n && (t.flags |= 2048),
          vn(Fe),
          qe(t),
          null
        )
      case 25:
        return null
      case 30:
        return null
    }
    throw Error(u(156, t.tag))
  }
  function Rv(e, t) {
    switch ((qc(t), t.tag)) {
      case 1:
        return ((e = t.flags), e & 65536 ? ((t.flags = (e & -65537) | 128), t) : null)
      case 3:
        return (
          vn(Fe),
          Xe(),
          (e = t.flags),
          (e & 65536) !== 0 && (e & 128) === 0 ? ((t.flags = (e & -65537) | 128), t) : null
        )
      case 26:
      case 27:
      case 5:
        return (ls(t), null)
      case 31:
        if (t.memoizedState !== null) {
          if ((zt(t), t.alternate === null)) throw Error(u(340))
          _l()
        }
        return ((e = t.flags), e & 65536 ? ((t.flags = (e & -65537) | 128), t) : null)
      case 13:
        if ((zt(t), (e = t.memoizedState), e !== null && e.dehydrated !== null)) {
          if (t.alternate === null) throw Error(u(340))
          _l()
        }
        return ((e = t.flags), e & 65536 ? ((t.flags = (e & -65537) | 128), t) : null)
      case 19:
        return (B(Je), null)
      case 4:
        return (Xe(), null)
      case 10:
        return (vn(t.type), null)
      case 22:
      case 23:
        return (zt(t), er(), e !== null && B(xl), (e = t.flags), e & 65536 ? ((t.flags = (e & -65537) | 128), t) : null)
      case 24:
        return (vn(Fe), null)
      case 25:
        return null
      default:
        return null
    }
  }
  function Ih(e, t) {
    switch ((qc(t), t.tag)) {
      case 3:
        ;(vn(Fe), Xe())
        break
      case 26:
      case 27:
      case 5:
        ls(t)
        break
      case 4:
        Xe()
        break
      case 31:
        t.memoizedState !== null && zt(t)
        break
      case 13:
        zt(t)
        break
      case 19:
        B(Je)
        break
      case 10:
        vn(t.type)
        break
      case 22:
      case 23:
        ;(zt(t), er(), e !== null && B(xl))
        break
      case 24:
        vn(Fe)
    }
  }
  function xi(e, t) {
    try {
      var n = t.updateQueue,
        i = n !== null ? n.lastEffect : null
      if (i !== null) {
        var r = i.next
        n = r
        do {
          if ((n.tag & e) === e) {
            i = void 0
            var o = n.create,
              h = n.inst
            ;((i = o()), (h.destroy = i))
          }
          n = n.next
        } while (n !== r)
      }
    } catch (v) {
      Ce(t, t.return, v)
    }
  }
  function $n(e, t, n) {
    try {
      var i = t.updateQueue,
        r = i !== null ? i.lastEffect : null
      if (r !== null) {
        var o = r.next
        i = o
        do {
          if ((i.tag & e) === e) {
            var h = i.inst,
              v = h.destroy
            if (v !== void 0) {
              ;((h.destroy = void 0), (r = t))
              var b = n,
                w = v
              try {
                w()
              } catch (D) {
                Ce(r, b, D)
              }
            }
          }
          i = i.next
        } while (i !== o)
      }
    } catch (D) {
      Ce(t, t.return, D)
    }
  }
  function Wh(e) {
    var t = e.updateQueue
    if (t !== null) {
      var n = e.stateNode
      try {
        Yd(t, n)
      } catch (i) {
        Ce(e, e.return, i)
      }
    }
  }
  function Fh(e, t, n) {
    ;((n.props = wl(e.type, e.memoizedProps)), (n.state = e.memoizedState))
    try {
      n.componentWillUnmount()
    } catch (i) {
      Ce(e, t, i)
    }
  }
  function Ei(e, t) {
    try {
      var n = e.ref
      if (n !== null) {
        switch (e.tag) {
          case 26:
          case 27:
          case 5:
            var i = e.stateNode
            break
          case 30:
            i = e.stateNode
            break
          default:
            i = e.stateNode
        }
        typeof n == 'function' ? (e.refCleanup = n(i)) : (n.current = i)
      }
    } catch (r) {
      Ce(e, t, r)
    }
  }
  function sn(e, t) {
    var n = e.ref,
      i = e.refCleanup
    if (n !== null)
      if (typeof i == 'function')
        try {
          i()
        } catch (r) {
          Ce(e, t, r)
        } finally {
          ;((e.refCleanup = null), (e = e.alternate), e != null && (e.refCleanup = null))
        }
      else if (typeof n == 'function')
        try {
          n(null)
        } catch (r) {
          Ce(e, t, r)
        }
      else n.current = null
  }
  function Ph(e) {
    var t = e.type,
      n = e.memoizedProps,
      i = e.stateNode
    try {
      e: switch (t) {
        case 'button':
        case 'input':
        case 'select':
        case 'textarea':
          n.autoFocus && i.focus()
          break e
        case 'img':
          n.src ? (i.src = n.src) : n.srcSet && (i.srcset = n.srcSet)
      }
    } catch (r) {
      Ce(e, e.return, r)
    }
  }
  function Mr(e, t, n) {
    try {
      var i = e.stateNode
      ;(a0(i, e.type, n, t), (i[vt] = t))
    } catch (r) {
      Ce(e, e.return, r)
    }
  }
  function em(e) {
    return e.tag === 5 || e.tag === 3 || e.tag === 26 || (e.tag === 27 && Pn(e.type)) || e.tag === 4
  }
  function Dr(e) {
    e: for (;;) {
      for (; e.sibling === null; ) {
        if (e.return === null || em(e.return)) return null
        e = e.return
      }
      for (e.sibling.return = e.return, e = e.sibling; e.tag !== 5 && e.tag !== 6 && e.tag !== 18; ) {
        if ((e.tag === 27 && Pn(e.type)) || e.flags & 2 || e.child === null || e.tag === 4) continue e
        ;((e.child.return = e), (e = e.child))
      }
      if (!(e.flags & 2)) return e.stateNode
    }
  }
  function zr(e, t, n) {
    var i = e.tag
    if (i === 5 || i === 6)
      ((e = e.stateNode),
        t
          ? (n.nodeType === 9 ? n.body : n.nodeName === 'HTML' ? n.ownerDocument.body : n).insertBefore(e, t)
          : ((t = n.nodeType === 9 ? n.body : n.nodeName === 'HTML' ? n.ownerDocument.body : n),
            t.appendChild(e),
            (n = n._reactRootContainer),
            n != null || t.onclick !== null || (t.onclick = hn)))
    else if (i !== 4 && (i === 27 && Pn(e.type) && ((n = e.stateNode), (t = null)), (e = e.child), e !== null))
      for (zr(e, t, n), e = e.sibling; e !== null; ) (zr(e, t, n), (e = e.sibling))
  }
  function Qs(e, t, n) {
    var i = e.tag
    if (i === 5 || i === 6) ((e = e.stateNode), t ? n.insertBefore(e, t) : n.appendChild(e))
    else if (i !== 4 && (i === 27 && Pn(e.type) && (n = e.stateNode), (e = e.child), e !== null))
      for (Qs(e, t, n), e = e.sibling; e !== null; ) (Qs(e, t, n), (e = e.sibling))
  }
  function tm(e) {
    var t = e.stateNode,
      n = e.memoizedProps
    try {
      for (var i = e.type, r = t.attributes; r.length; ) t.removeAttributeNode(r[0])
      ;(ft(t, i, n), (t[st] = e), (t[vt] = n))
    } catch (o) {
      Ce(e, e.return, o)
    }
  }
  var Nn = !1,
    tt = !1,
    Lr = !1,
    nm = typeof WeakSet == 'function' ? WeakSet : Set,
    it = null
  function Uv(e, t) {
    if (((e = e.containerInfo), (nf = mu), (e = md(e)), jc(e))) {
      if ('selectionStart' in e) var n = { start: e.selectionStart, end: e.selectionEnd }
      else
        e: {
          n = ((n = e.ownerDocument) && n.defaultView) || window
          var i = n.getSelection && n.getSelection()
          if (i && i.rangeCount !== 0) {
            n = i.anchorNode
            var r = i.anchorOffset,
              o = i.focusNode
            i = i.focusOffset
            try {
              ;(n.nodeType, o.nodeType)
            } catch {
              n = null
              break e
            }
            var h = 0,
              v = -1,
              b = -1,
              w = 0,
              D = 0,
              q = e,
              k = null
            t: for (;;) {
              for (
                var C;
                q !== n || (r !== 0 && q.nodeType !== 3) || (v = h + r),
                  q !== o || (i !== 0 && q.nodeType !== 3) || (b = h + i),
                  q.nodeType === 3 && (h += q.nodeValue.length),
                  (C = q.firstChild) !== null;

              )
                ((k = q), (q = C))
              for (;;) {
                if (q === e) break t
                if ((k === n && ++w === r && (v = h), k === o && ++D === i && (b = h), (C = q.nextSibling) !== null))
                  break
                ;((q = k), (k = q.parentNode))
              }
              q = C
            }
            n = v === -1 || b === -1 ? null : { start: v, end: b }
          } else n = null
        }
      n = n || { start: 0, end: 0 }
    } else n = null
    for (lf = { focusedElem: e, selectionRange: n }, mu = !1, it = t; it !== null; )
      if (((t = it), (e = t.child), (t.subtreeFlags & 1028) !== 0 && e !== null)) ((e.return = t), (it = e))
      else
        for (; it !== null; ) {
          switch (((t = it), (o = t.alternate), (e = t.flags), t.tag)) {
            case 0:
              if ((e & 4) !== 0 && ((e = t.updateQueue), (e = e !== null ? e.events : null), e !== null))
                for (n = 0; n < e.length; n++) ((r = e[n]), (r.ref.impl = r.nextImpl))
              break
            case 11:
            case 15:
              break
            case 1:
              if ((e & 1024) !== 0 && o !== null) {
                ;((e = void 0), (n = t), (r = o.memoizedProps), (o = o.memoizedState), (i = n.stateNode))
                try {
                  var ee = wl(n.type, r)
                  ;((e = i.getSnapshotBeforeUpdate(ee, o)), (i.__reactInternalSnapshotBeforeUpdate = e))
                } catch (ue) {
                  Ce(n, n.return, ue)
                }
              }
              break
            case 3:
              if ((e & 1024) !== 0) {
                if (((e = t.stateNode.containerInfo), (n = e.nodeType), n === 9)) uf(e)
                else if (n === 1)
                  switch (e.nodeName) {
                    case 'HEAD':
                    case 'HTML':
                    case 'BODY':
                      uf(e)
                      break
                    default:
                      e.textContent = ''
                  }
              }
              break
            case 5:
            case 26:
            case 27:
            case 6:
            case 4:
            case 17:
              break
            default:
              if ((e & 1024) !== 0) throw Error(u(163))
          }
          if (((e = t.sibling), e !== null)) {
            ;((e.return = t.return), (it = e))
            break
          }
          it = t.return
        }
  }
  function lm(e, t, n) {
    var i = n.flags
    switch (n.tag) {
      case 0:
      case 11:
      case 15:
        ;(En(e, n), i & 4 && xi(5, n))
        break
      case 1:
        if ((En(e, n), i & 4))
          if (((e = n.stateNode), t === null))
            try {
              e.componentDidMount()
            } catch (h) {
              Ce(n, n.return, h)
            }
          else {
            var r = wl(n.type, t.memoizedProps)
            t = t.memoizedState
            try {
              e.componentDidUpdate(r, t, e.__reactInternalSnapshotBeforeUpdate)
            } catch (h) {
              Ce(n, n.return, h)
            }
          }
        ;(i & 64 && Wh(n), i & 512 && Ei(n, n.return))
        break
      case 3:
        if ((En(e, n), i & 64 && ((e = n.updateQueue), e !== null))) {
          if (((t = null), n.child !== null))
            switch (n.child.tag) {
              case 27:
              case 5:
                t = n.child.stateNode
                break
              case 1:
                t = n.child.stateNode
            }
          try {
            Yd(e, t)
          } catch (h) {
            Ce(n, n.return, h)
          }
        }
        break
      case 27:
        t === null && i & 4 && tm(n)
      case 26:
      case 5:
        ;(En(e, n), t === null && i & 4 && Ph(n), i & 512 && Ei(n, n.return))
        break
      case 12:
        En(e, n)
        break
      case 31:
        ;(En(e, n), i & 4 && sm(e, n))
        break
      case 13:
        ;(En(e, n),
          i & 4 && um(e, n),
          i & 64 &&
            ((e = n.memoizedState),
            e !== null && ((e = e.dehydrated), e !== null && ((n = $v.bind(null, n)), d0(e, n)))))
        break
      case 22:
        if (((i = n.memoizedState !== null || Nn), !i)) {
          ;((t = (t !== null && t.memoizedState !== null) || tt), (r = Nn))
          var o = tt
          ;((Nn = i), (tt = t) && !o ? An(e, n, (n.subtreeFlags & 8772) !== 0) : En(e, n), (Nn = r), (tt = o))
        }
        break
      case 30:
        break
      default:
        En(e, n)
    }
  }
  function am(e) {
    var t = e.alternate
    ;(t !== null && ((e.alternate = null), am(t)),
      (e.child = null),
      (e.deletions = null),
      (e.sibling = null),
      e.tag === 5 && ((t = e.stateNode), t !== null && oc(t)),
      (e.stateNode = null),
      (e.return = null),
      (e.dependencies = null),
      (e.memoizedProps = null),
      (e.memoizedState = null),
      (e.pendingProps = null),
      (e.stateNode = null),
      (e.updateQueue = null))
  }
  var He = null,
    St = !1
  function xn(e, t, n) {
    for (n = n.child; n !== null; ) (im(e, t, n), (n = n.sibling))
  }
  function im(e, t, n) {
    if (wt && typeof wt.onCommitFiberUnmount == 'function')
      try {
        wt.onCommitFiberUnmount(Ja, n)
      } catch {}
    switch (n.tag) {
      case 26:
        ;(tt || sn(n, t),
          xn(e, t, n),
          n.memoizedState ? n.memoizedState.count-- : n.stateNode && ((n = n.stateNode), n.parentNode.removeChild(n)))
        break
      case 27:
        tt || sn(n, t)
        var i = He,
          r = St
        ;(Pn(n.type) && ((He = n.stateNode), (St = !1)), xn(e, t, n), zi(n.stateNode), (He = i), (St = r))
        break
      case 5:
        tt || sn(n, t)
      case 6:
        if (((i = He), (r = St), (He = null), xn(e, t, n), (He = i), (St = r), He !== null))
          if (St)
            try {
              ;(He.nodeType === 9 ? He.body : He.nodeName === 'HTML' ? He.ownerDocument.body : He).removeChild(
                n.stateNode
              )
            } catch (o) {
              Ce(n, t, o)
            }
          else
            try {
              He.removeChild(n.stateNode)
            } catch (o) {
              Ce(n, t, o)
            }
        break
      case 18:
        He !== null &&
          (St
            ? ((e = He),
              Wm(e.nodeType === 9 ? e.body : e.nodeName === 'HTML' ? e.ownerDocument.body : e, n.stateNode),
              xa(e))
            : Wm(He, n.stateNode))
        break
      case 4:
        ;((i = He), (r = St), (He = n.stateNode.containerInfo), (St = !0), xn(e, t, n), (He = i), (St = r))
        break
      case 0:
      case 11:
      case 14:
      case 15:
        ;($n(2, n, t), tt || $n(4, n, t), xn(e, t, n))
        break
      case 1:
        ;(tt || (sn(n, t), (i = n.stateNode), typeof i.componentWillUnmount == 'function' && Fh(n, t, i)), xn(e, t, n))
        break
      case 21:
        xn(e, t, n)
        break
      case 22:
        ;((tt = (i = tt) || n.memoizedState !== null), xn(e, t, n), (tt = i))
        break
      default:
        xn(e, t, n)
    }
  }
  function sm(e, t) {
    if (t.memoizedState === null && ((e = t.alternate), e !== null && ((e = e.memoizedState), e !== null))) {
      e = e.dehydrated
      try {
        xa(e)
      } catch (n) {
        Ce(t, t.return, n)
      }
    }
  }
  function um(e, t) {
    if (
      t.memoizedState === null &&
      ((e = t.alternate), e !== null && ((e = e.memoizedState), e !== null && ((e = e.dehydrated), e !== null)))
    )
      try {
        xa(e)
      } catch (n) {
        Ce(t, t.return, n)
      }
  }
  function Bv(e) {
    switch (e.tag) {
      case 31:
      case 13:
      case 19:
        var t = e.stateNode
        return (t === null && (t = e.stateNode = new nm()), t)
      case 22:
        return ((e = e.stateNode), (t = e._retryCache), t === null && (t = e._retryCache = new nm()), t)
      default:
        throw Error(u(435, e.tag))
    }
  }
  function Xs(e, t) {
    var n = Bv(e)
    t.forEach(function (i) {
      if (!n.has(i)) {
        n.add(i)
        var r = Qv.bind(null, e, i)
        i.then(r, r)
      }
    })
  }
  function _t(e, t) {
    var n = t.deletions
    if (n !== null)
      for (var i = 0; i < n.length; i++) {
        var r = n[i],
          o = e,
          h = t,
          v = h
        e: for (; v !== null; ) {
          switch (v.tag) {
            case 27:
              if (Pn(v.type)) {
                ;((He = v.stateNode), (St = !1))
                break e
              }
              break
            case 5:
              ;((He = v.stateNode), (St = !1))
              break e
            case 3:
            case 4:
              ;((He = v.stateNode.containerInfo), (St = !0))
              break e
          }
          v = v.return
        }
        if (He === null) throw Error(u(160))
        ;(im(o, h, r), (He = null), (St = !1), (o = r.alternate), o !== null && (o.return = null), (r.return = null))
      }
    if (t.subtreeFlags & 13886) for (t = t.child; t !== null; ) (cm(t, e), (t = t.sibling))
  }
  var Pt = null
  function cm(e, t) {
    var n = e.alternate,
      i = e.flags
    switch (e.tag) {
      case 0:
      case 11:
      case 14:
      case 15:
        ;(_t(t, e), Tt(e), i & 4 && ($n(3, e, e.return), xi(3, e), $n(5, e, e.return)))
        break
      case 1:
        ;(_t(t, e),
          Tt(e),
          i & 512 && (tt || n === null || sn(n, n.return)),
          i & 64 &&
            Nn &&
            ((e = e.updateQueue),
            e !== null &&
              ((i = e.callbacks),
              i !== null &&
                ((n = e.shared.hiddenCallbacks), (e.shared.hiddenCallbacks = n === null ? i : n.concat(i))))))
        break
      case 26:
        var r = Pt
        if ((_t(t, e), Tt(e), i & 512 && (tt || n === null || sn(n, n.return)), i & 4)) {
          var o = n !== null ? n.memoizedState : null
          if (((i = e.memoizedState), n === null))
            if (i === null)
              if (e.stateNode === null) {
                e: {
                  ;((i = e.type), (n = e.memoizedProps), (r = r.ownerDocument || r))
                  t: switch (i) {
                    case 'title':
                      ;((o = r.getElementsByTagName('title')[0]),
                        (!o ||
                          o[Fa] ||
                          o[st] ||
                          o.namespaceURI === 'http://www.w3.org/2000/svg' ||
                          o.hasAttribute('itemprop')) &&
                          ((o = r.createElement(i)), r.head.insertBefore(o, r.querySelector('head > title'))),
                        ft(o, i, n),
                        (o[st] = e),
                        at(o),
                        (i = o))
                      break e
                    case 'link':
                      var h = cy('link', 'href', r).get(i + (n.href || ''))
                      if (h) {
                        for (var v = 0; v < h.length; v++)
                          if (
                            ((o = h[v]),
                            o.getAttribute('href') === (n.href == null || n.href === '' ? null : n.href) &&
                              o.getAttribute('rel') === (n.rel == null ? null : n.rel) &&
                              o.getAttribute('title') === (n.title == null ? null : n.title) &&
                              o.getAttribute('crossorigin') === (n.crossOrigin == null ? null : n.crossOrigin))
                          ) {
                            h.splice(v, 1)
                            break t
                          }
                      }
                      ;((o = r.createElement(i)), ft(o, i, n), r.head.appendChild(o))
                      break
                    case 'meta':
                      if ((h = cy('meta', 'content', r).get(i + (n.content || '')))) {
                        for (v = 0; v < h.length; v++)
                          if (
                            ((o = h[v]),
                            o.getAttribute('content') === (n.content == null ? null : '' + n.content) &&
                              o.getAttribute('name') === (n.name == null ? null : n.name) &&
                              o.getAttribute('property') === (n.property == null ? null : n.property) &&
                              o.getAttribute('http-equiv') === (n.httpEquiv == null ? null : n.httpEquiv) &&
                              o.getAttribute('charset') === (n.charSet == null ? null : n.charSet))
                          ) {
                            h.splice(v, 1)
                            break t
                          }
                      }
                      ;((o = r.createElement(i)), ft(o, i, n), r.head.appendChild(o))
                      break
                    default:
                      throw Error(u(468, i))
                  }
                  ;((o[st] = e), at(o), (i = o))
                }
                e.stateNode = i
              } else ry(r, e.type, e.stateNode)
            else e.stateNode = uy(r, i, e.memoizedProps)
          else
            o !== i
              ? (o === null ? n.stateNode !== null && ((n = n.stateNode), n.parentNode.removeChild(n)) : o.count--,
                i === null ? ry(r, e.type, e.stateNode) : uy(r, i, e.memoizedProps))
              : i === null && e.stateNode !== null && Mr(e, e.memoizedProps, n.memoizedProps)
        }
        break
      case 27:
        ;(_t(t, e),
          Tt(e),
          i & 512 && (tt || n === null || sn(n, n.return)),
          n !== null && i & 4 && Mr(e, e.memoizedProps, n.memoizedProps))
        break
      case 5:
        if ((_t(t, e), Tt(e), i & 512 && (tt || n === null || sn(n, n.return)), e.flags & 32)) {
          r = e.stateNode
          try {
            Ql(r, '')
          } catch (ee) {
            Ce(e, e.return, ee)
          }
        }
        ;(i & 4 && e.stateNode != null && ((r = e.memoizedProps), Mr(e, r, n !== null ? n.memoizedProps : r)),
          i & 1024 && (Lr = !0))
        break
      case 6:
        if ((_t(t, e), Tt(e), i & 4)) {
          if (e.stateNode === null) throw Error(u(162))
          ;((i = e.memoizedProps), (n = e.stateNode))
          try {
            n.nodeValue = i
          } catch (ee) {
            Ce(e, e.return, ee)
          }
        }
        break
      case 3:
        if (
          ((fu = null),
          (r = Pt),
          (Pt = cu(t.containerInfo)),
          _t(t, e),
          (Pt = r),
          Tt(e),
          i & 4 && n !== null && n.memoizedState.isDehydrated)
        )
          try {
            xa(t.containerInfo)
          } catch (ee) {
            Ce(e, e.return, ee)
          }
        Lr && ((Lr = !1), rm(e))
        break
      case 4:
        ;((i = Pt), (Pt = cu(e.stateNode.containerInfo)), _t(t, e), Tt(e), (Pt = i))
        break
      case 12:
        ;(_t(t, e), Tt(e))
        break
      case 31:
        ;(_t(t, e), Tt(e), i & 4 && ((i = e.updateQueue), i !== null && ((e.updateQueue = null), Xs(e, i))))
        break
      case 13:
        ;(_t(t, e),
          Tt(e),
          e.child.flags & 8192 && (e.memoizedState !== null) != (n !== null && n.memoizedState !== null) && (Is = jt()),
          i & 4 && ((i = e.updateQueue), i !== null && ((e.updateQueue = null), Xs(e, i))))
        break
      case 22:
        r = e.memoizedState !== null
        var b = n !== null && n.memoizedState !== null,
          w = Nn,
          D = tt
        if (((Nn = w || r), (tt = D || b), _t(t, e), (tt = D), (Nn = w), Tt(e), i & 8192))
          e: for (
            t = e.stateNode,
              t._visibility = r ? t._visibility & -2 : t._visibility | 1,
              r && (n === null || b || Nn || tt || kl(e)),
              n = null,
              t = e;
            ;

          ) {
            if (t.tag === 5 || t.tag === 26) {
              if (n === null) {
                b = n = t
                try {
                  if (((o = b.stateNode), r))
                    ((h = o.style),
                      typeof h.setProperty == 'function'
                        ? h.setProperty('display', 'none', 'important')
                        : (h.display = 'none'))
                  else {
                    v = b.stateNode
                    var q = b.memoizedProps.style,
                      k = q != null && q.hasOwnProperty('display') ? q.display : null
                    v.style.display = k == null || typeof k == 'boolean' ? '' : ('' + k).trim()
                  }
                } catch (ee) {
                  Ce(b, b.return, ee)
                }
              }
            } else if (t.tag === 6) {
              if (n === null) {
                b = t
                try {
                  b.stateNode.nodeValue = r ? '' : b.memoizedProps
                } catch (ee) {
                  Ce(b, b.return, ee)
                }
              }
            } else if (t.tag === 18) {
              if (n === null) {
                b = t
                try {
                  var C = b.stateNode
                  r ? Fm(C, !0) : Fm(b.stateNode, !1)
                } catch (ee) {
                  Ce(b, b.return, ee)
                }
              }
            } else if (((t.tag !== 22 && t.tag !== 23) || t.memoizedState === null || t === e) && t.child !== null) {
              ;((t.child.return = t), (t = t.child))
              continue
            }
            if (t === e) break e
            for (; t.sibling === null; ) {
              if (t.return === null || t.return === e) break e
              ;(n === t && (n = null), (t = t.return))
            }
            ;(n === t && (n = null), (t.sibling.return = t.return), (t = t.sibling))
          }
        i & 4 &&
          ((i = e.updateQueue), i !== null && ((n = i.retryQueue), n !== null && ((i.retryQueue = null), Xs(e, n))))
        break
      case 19:
        ;(_t(t, e), Tt(e), i & 4 && ((i = e.updateQueue), i !== null && ((e.updateQueue = null), Xs(e, i))))
        break
      case 30:
        break
      case 21:
        break
      default:
        ;(_t(t, e), Tt(e))
    }
  }
  function Tt(e) {
    var t = e.flags
    if (t & 2) {
      try {
        for (var n, i = e.return; i !== null; ) {
          if (em(i)) {
            n = i
            break
          }
          i = i.return
        }
        if (n == null) throw Error(u(160))
        switch (n.tag) {
          case 27:
            var r = n.stateNode,
              o = Dr(e)
            Qs(e, o, r)
            break
          case 5:
            var h = n.stateNode
            n.flags & 32 && (Ql(h, ''), (n.flags &= -33))
            var v = Dr(e)
            Qs(e, v, h)
            break
          case 3:
          case 4:
            var b = n.stateNode.containerInfo,
              w = Dr(e)
            zr(e, w, b)
            break
          default:
            throw Error(u(161))
        }
      } catch (D) {
        Ce(e, e.return, D)
      }
      e.flags &= -3
    }
    t & 4096 && (e.flags &= -4097)
  }
  function rm(e) {
    if (e.subtreeFlags & 1024)
      for (e = e.child; e !== null; ) {
        var t = e
        ;(rm(t), t.tag === 5 && t.flags & 1024 && t.stateNode.reset(), (e = e.sibling))
      }
  }
  function En(e, t) {
    if (t.subtreeFlags & 8772) for (t = t.child; t !== null; ) (lm(e, t.alternate, t), (t = t.sibling))
  }
  function kl(e) {
    for (e = e.child; e !== null; ) {
      var t = e
      switch (t.tag) {
        case 0:
        case 11:
        case 14:
        case 15:
          ;($n(4, t, t.return), kl(t))
          break
        case 1:
          sn(t, t.return)
          var n = t.stateNode
          ;(typeof n.componentWillUnmount == 'function' && Fh(t, t.return, n), kl(t))
          break
        case 27:
          zi(t.stateNode)
        case 26:
        case 5:
          ;(sn(t, t.return), kl(t))
          break
        case 22:
          t.memoizedState === null && kl(t)
          break
        case 30:
          kl(t)
          break
        default:
          kl(t)
      }
      e = e.sibling
    }
  }
  function An(e, t, n) {
    for (n = n && (t.subtreeFlags & 8772) !== 0, t = t.child; t !== null; ) {
      var i = t.alternate,
        r = e,
        o = t,
        h = o.flags
      switch (o.tag) {
        case 0:
        case 11:
        case 15:
          ;(An(r, o, n), xi(4, o))
          break
        case 1:
          if ((An(r, o, n), (i = o), (r = i.stateNode), typeof r.componentDidMount == 'function'))
            try {
              r.componentDidMount()
            } catch (w) {
              Ce(i, i.return, w)
            }
          if (((i = o), (r = i.updateQueue), r !== null)) {
            var v = i.stateNode
            try {
              var b = r.shared.hiddenCallbacks
              if (b !== null) for (r.shared.hiddenCallbacks = null, r = 0; r < b.length; r++) Hd(b[r], v)
            } catch (w) {
              Ce(i, i.return, w)
            }
          }
          ;(n && h & 64 && Wh(o), Ei(o, o.return))
          break
        case 27:
          tm(o)
        case 26:
        case 5:
          ;(An(r, o, n), n && i === null && h & 4 && Ph(o), Ei(o, o.return))
          break
        case 12:
          An(r, o, n)
          break
        case 31:
          ;(An(r, o, n), n && h & 4 && sm(r, o))
          break
        case 13:
          ;(An(r, o, n), n && h & 4 && um(r, o))
          break
        case 22:
          ;(o.memoizedState === null && An(r, o, n), Ei(o, o.return))
          break
        case 30:
          break
        default:
          An(r, o, n)
      }
      t = t.sibling
    }
  }
  function Rr(e, t) {
    var n = null
    ;(e !== null &&
      e.memoizedState !== null &&
      e.memoizedState.cachePool !== null &&
      (n = e.memoizedState.cachePool.pool),
      (e = null),
      t.memoizedState !== null && t.memoizedState.cachePool !== null && (e = t.memoizedState.cachePool.pool),
      e !== n && (e != null && e.refCount++, n != null && oi(n)))
  }
  function Ur(e, t) {
    ;((e = null),
      t.alternate !== null && (e = t.alternate.memoizedState.cache),
      (t = t.memoizedState.cache),
      t !== e && (t.refCount++, e != null && oi(e)))
  }
  function en(e, t, n, i) {
    if (t.subtreeFlags & 10256) for (t = t.child; t !== null; ) (fm(e, t, n, i), (t = t.sibling))
  }
  function fm(e, t, n, i) {
    var r = t.flags
    switch (t.tag) {
      case 0:
      case 11:
      case 15:
        ;(en(e, t, n, i), r & 2048 && xi(9, t))
        break
      case 1:
        en(e, t, n, i)
        break
      case 3:
        ;(en(e, t, n, i),
          r & 2048 &&
            ((e = null),
            t.alternate !== null && (e = t.alternate.memoizedState.cache),
            (t = t.memoizedState.cache),
            t !== e && (t.refCount++, e != null && oi(e))))
        break
      case 12:
        if (r & 2048) {
          ;(en(e, t, n, i), (e = t.stateNode))
          try {
            var o = t.memoizedProps,
              h = o.id,
              v = o.onPostCommit
            typeof v == 'function' && v(h, t.alternate === null ? 'mount' : 'update', e.passiveEffectDuration, -0)
          } catch (b) {
            Ce(t, t.return, b)
          }
        } else en(e, t, n, i)
        break
      case 31:
        en(e, t, n, i)
        break
      case 13:
        en(e, t, n, i)
        break
      case 23:
        break
      case 22:
        ;((o = t.stateNode),
          (h = t.alternate),
          t.memoizedState !== null
            ? o._visibility & 2
              ? en(e, t, n, i)
              : Ai(e, t)
            : o._visibility & 2
              ? en(e, t, n, i)
              : ((o._visibility |= 2), ha(e, t, n, i, (t.subtreeFlags & 10256) !== 0 || !1)),
          r & 2048 && Rr(h, t))
        break
      case 24:
        ;(en(e, t, n, i), r & 2048 && Ur(t.alternate, t))
        break
      default:
        en(e, t, n, i)
    }
  }
  function ha(e, t, n, i, r) {
    for (r = r && ((t.subtreeFlags & 10256) !== 0 || !1), t = t.child; t !== null; ) {
      var o = e,
        h = t,
        v = n,
        b = i,
        w = h.flags
      switch (h.tag) {
        case 0:
        case 11:
        case 15:
          ;(ha(o, h, v, b, r), xi(8, h))
          break
        case 23:
          break
        case 22:
          var D = h.stateNode
          ;(h.memoizedState !== null
            ? D._visibility & 2
              ? ha(o, h, v, b, r)
              : Ai(o, h)
            : ((D._visibility |= 2), ha(o, h, v, b, r)),
            r && w & 2048 && Rr(h.alternate, h))
          break
        case 24:
          ;(ha(o, h, v, b, r), r && w & 2048 && Ur(h.alternate, h))
          break
        default:
          ha(o, h, v, b, r)
      }
      t = t.sibling
    }
  }
  function Ai(e, t) {
    if (t.subtreeFlags & 10256)
      for (t = t.child; t !== null; ) {
        var n = e,
          i = t,
          r = i.flags
        switch (i.tag) {
          case 22:
            ;(Ai(n, i), r & 2048 && Rr(i.alternate, i))
            break
          case 24:
            ;(Ai(n, i), r & 2048 && Ur(i.alternate, i))
            break
          default:
            Ai(n, i)
        }
        t = t.sibling
      }
  }
  var Oi = 8192
  function ma(e, t, n) {
    if (e.subtreeFlags & Oi) for (e = e.child; e !== null; ) (om(e, t, n), (e = e.sibling))
  }
  function om(e, t, n) {
    switch (e.tag) {
      case 26:
        ;(ma(e, t, n), e.flags & Oi && e.memoizedState !== null && x0(n, Pt, e.memoizedState, e.memoizedProps))
        break
      case 5:
        ma(e, t, n)
        break
      case 3:
      case 4:
        var i = Pt
        ;((Pt = cu(e.stateNode.containerInfo)), ma(e, t, n), (Pt = i))
        break
      case 22:
        e.memoizedState === null &&
          ((i = e.alternate),
          i !== null && i.memoizedState !== null ? ((i = Oi), (Oi = 16777216), ma(e, t, n), (Oi = i)) : ma(e, t, n))
        break
      default:
        ma(e, t, n)
    }
  }
  function dm(e) {
    var t = e.alternate
    if (t !== null && ((e = t.child), e !== null)) {
      t.child = null
      do ((t = e.sibling), (e.sibling = null), (e = t))
      while (e !== null)
    }
  }
  function ji(e) {
    var t = e.deletions
    if ((e.flags & 16) !== 0) {
      if (t !== null)
        for (var n = 0; n < t.length; n++) {
          var i = t[n]
          ;((it = i), mm(i, e))
        }
      dm(e)
    }
    if (e.subtreeFlags & 10256) for (e = e.child; e !== null; ) (hm(e), (e = e.sibling))
  }
  function hm(e) {
    switch (e.tag) {
      case 0:
      case 11:
      case 15:
        ;(ji(e), e.flags & 2048 && $n(9, e, e.return))
        break
      case 3:
        ji(e)
        break
      case 12:
        ji(e)
        break
      case 22:
        var t = e.stateNode
        e.memoizedState !== null && t._visibility & 2 && (e.return === null || e.return.tag !== 13)
          ? ((t._visibility &= -3), Js(e))
          : ji(e)
        break
      default:
        ji(e)
    }
  }
  function Js(e) {
    var t = e.deletions
    if ((e.flags & 16) !== 0) {
      if (t !== null)
        for (var n = 0; n < t.length; n++) {
          var i = t[n]
          ;((it = i), mm(i, e))
        }
      dm(e)
    }
    for (e = e.child; e !== null; ) {
      switch (((t = e), t.tag)) {
        case 0:
        case 11:
        case 15:
          ;($n(8, t, t.return), Js(t))
          break
        case 22:
          ;((n = t.stateNode), n._visibility & 2 && ((n._visibility &= -3), Js(t)))
          break
        default:
          Js(t)
      }
      e = e.sibling
    }
  }
  function mm(e, t) {
    for (; it !== null; ) {
      var n = it
      switch (n.tag) {
        case 0:
        case 11:
        case 15:
          $n(8, n, t)
          break
        case 23:
        case 22:
          if (n.memoizedState !== null && n.memoizedState.cachePool !== null) {
            var i = n.memoizedState.cachePool.pool
            i != null && i.refCount++
          }
          break
        case 24:
          oi(n.memoizedState.cache)
      }
      if (((i = n.child), i !== null)) ((i.return = n), (it = i))
      else
        e: for (n = e; it !== null; ) {
          i = it
          var r = i.sibling,
            o = i.return
          if ((am(i), i === n)) {
            it = null
            break e
          }
          if (r !== null) {
            ;((r.return = o), (it = r))
            break e
          }
          it = o
        }
    }
  }
  var qv = {
      getCacheForType: function (e) {
        var t = ct(Fe),
          n = t.data.get(e)
        return (n === void 0 && ((n = e()), t.data.set(e, n)), n)
      },
      cacheSignal: function () {
        return ct(Fe).controller.signal
      },
    },
    Hv = typeof WeakMap == 'function' ? WeakMap : Map,
    je = 0,
    Re = null,
    be = null,
    _e = 0,
    ke = 0,
    Lt = null,
    Qn = !1,
    ya = !1,
    Br = !1,
    On = 0,
    $e = 0,
    Xn = 0,
    Cl = 0,
    qr = 0,
    Rt = 0,
    pa = 0,
    wi = null,
    Nt = null,
    Hr = !1,
    Is = 0,
    ym = 0,
    Ws = 1 / 0,
    Fs = null,
    Jn = null,
    lt = 0,
    In = null,
    ga = null,
    jn = 0,
    Yr = 0,
    Zr = null,
    pm = null,
    ki = 0,
    Vr = null
  function Ut() {
    return (je & 2) !== 0 && _e !== 0 ? _e & -_e : z.T !== null ? Jr() : Mo()
  }
  function gm() {
    if (Rt === 0)
      if ((_e & 536870912) === 0 || Ne) {
        var e = ss
        ;((ss <<= 1), (ss & 3932160) === 0 && (ss = 262144), (Rt = e))
      } else Rt = 536870912
    return ((e = Dt.current), e !== null && (e.flags |= 32), Rt)
  }
  function xt(e, t, n) {
    ;(((e === Re && (ke === 2 || ke === 9)) || e.cancelPendingCommit !== null) && (va(e, 0), Wn(e, _e, Rt, !1)),
      Wa(e, n),
      ((je & 2) === 0 || e !== Re) && (e === Re && ((je & 2) === 0 && (Cl |= n), $e === 4 && Wn(e, _e, Rt, !1)), un(e)))
  }
  function vm(e, t, n) {
    if ((je & 6) !== 0) throw Error(u(327))
    var i = (!n && (t & 127) === 0 && (t & e.expiredLanes) === 0) || Ia(e, t),
      r = i ? Vv(e, t) : Gr(e, t, !0),
      o = i
    do {
      if (r === 0) {
        ya && !i && Wn(e, t, 0, !1)
        break
      } else {
        if (((n = e.current.alternate), o && !Yv(n))) {
          ;((r = Gr(e, t, !1)), (o = !1))
          continue
        }
        if (r === 2) {
          if (((o = t), e.errorRecoveryDisabledLanes & o)) var h = 0
          else ((h = e.pendingLanes & -536870913), (h = h !== 0 ? h : h & 536870912 ? 536870912 : 0))
          if (h !== 0) {
            t = h
            e: {
              var v = e
              r = wi
              var b = v.current.memoizedState.isDehydrated
              if ((b && (va(v, h).flags |= 256), (h = Gr(v, h, !1)), h !== 2)) {
                if (Br && !b) {
                  ;((v.errorRecoveryDisabledLanes |= o), (Cl |= o), (r = 4))
                  break e
                }
                ;((o = Nt), (Nt = r), o !== null && (Nt === null ? (Nt = o) : Nt.push.apply(Nt, o)))
              }
              r = h
            }
            if (((o = !1), r !== 2)) continue
          }
        }
        if (r === 1) {
          ;(va(e, 0), Wn(e, t, 0, !0))
          break
        }
        e: {
          switch (((i = e), (o = r), o)) {
            case 0:
            case 1:
              throw Error(u(345))
            case 4:
              if ((t & 4194048) !== t) break
            case 6:
              Wn(i, t, Rt, !Qn)
              break e
            case 2:
              Nt = null
              break
            case 3:
            case 5:
              break
            default:
              throw Error(u(329))
          }
          if ((t & 62914560) === t && ((r = Is + 300 - jt()), 10 < r)) {
            if ((Wn(i, t, Rt, !Qn), cs(i, 0, !0) !== 0)) break e
            ;((jn = t),
              (i.timeoutHandle = Jm(bm.bind(null, i, n, Nt, Fs, Hr, t, Rt, Cl, pa, Qn, o, 'Throttled', -0, 0), r)))
            break e
          }
          bm(i, n, Nt, Fs, Hr, t, Rt, Cl, pa, Qn, o, null, -0, 0)
        }
      }
      break
    } while (!0)
    un(e)
  }
  function bm(e, t, n, i, r, o, h, v, b, w, D, q, k, C) {
    if (((e.timeoutHandle = -1), (q = t.subtreeFlags), q & 8192 || (q & 16785408) === 16785408)) {
      ;((q = {
        stylesheets: null,
        count: 0,
        imgCount: 0,
        imgBytes: 0,
        suspenseyImages: [],
        waitingForImages: !0,
        waitingForViewTransition: !1,
        unsuspend: hn,
      }),
        om(t, o, q))
      var ee = (o & 62914560) === o ? Is - jt() : (o & 4194048) === o ? ym - jt() : 0
      if (((ee = E0(q, ee)), ee !== null)) {
        ;((jn = o),
          (e.cancelPendingCommit = ee(Om.bind(null, e, t, o, n, i, r, h, v, b, D, q, null, k, C))),
          Wn(e, o, h, !w))
        return
      }
    }
    Om(e, t, o, n, i, r, h, v, b)
  }
  function Yv(e) {
    for (var t = e; ; ) {
      var n = t.tag
      if (
        (n === 0 || n === 11 || n === 15) &&
        t.flags & 16384 &&
        ((n = t.updateQueue), n !== null && ((n = n.stores), n !== null))
      )
        for (var i = 0; i < n.length; i++) {
          var r = n[i],
            o = r.getSnapshot
          r = r.value
          try {
            if (!Ct(o(), r)) return !1
          } catch {
            return !1
          }
        }
      if (((n = t.child), t.subtreeFlags & 16384 && n !== null)) ((n.return = t), (t = n))
      else {
        if (t === e) break
        for (; t.sibling === null; ) {
          if (t.return === null || t.return === e) return !0
          t = t.return
        }
        ;((t.sibling.return = t.return), (t = t.sibling))
      }
    }
    return !0
  }
  function Wn(e, t, n, i) {
    ;((t &= ~qr),
      (t &= ~Cl),
      (e.suspendedLanes |= t),
      (e.pingedLanes &= ~t),
      i && (e.warmLanes |= t),
      (i = e.expirationTimes))
    for (var r = t; 0 < r; ) {
      var o = 31 - kt(r),
        h = 1 << o
      ;((i[o] = -1), (r &= ~h))
    }
    n !== 0 && wo(e, n, t)
  }
  function Ps() {
    return (je & 6) === 0 ? (Ci(0), !1) : !0
  }
  function Kr() {
    if (be !== null) {
      if (ke === 0) var e = be.return
      else ((e = be), (gn = Tl = null), sr(e), (ca = null), (hi = 0), (e = be))
      for (; e !== null; ) (Ih(e.alternate, e), (e = e.return))
      be = null
    }
  }
  function va(e, t) {
    var n = e.timeoutHandle
    ;(n !== -1 && ((e.timeoutHandle = -1), u0(n)),
      (n = e.cancelPendingCommit),
      n !== null && ((e.cancelPendingCommit = null), n()),
      (jn = 0),
      Kr(),
      (Re = e),
      (be = n = yn(e.current, null)),
      (_e = t),
      (ke = 0),
      (Lt = null),
      (Qn = !1),
      (ya = Ia(e, t)),
      (Br = !1),
      (pa = Rt = qr = Cl = Xn = $e = 0),
      (Nt = wi = null),
      (Hr = !1),
      (t & 8) !== 0 && (t |= t & 32))
    var i = e.entangledLanes
    if (i !== 0)
      for (e = e.entanglements, i &= t; 0 < i; ) {
        var r = 31 - kt(i),
          o = 1 << r
        ;((t |= e[r]), (i &= ~o))
      }
    return ((On = t), Ss(), n)
  }
  function Sm(e, t) {
    ;((me = null),
      (z.H = _i),
      t === ua || t === js
        ? ((t = Rd()), (ke = 3))
        : t === Xc
          ? ((t = Rd()), (ke = 4))
          : (ke = t === Tr ? 8 : t !== null && typeof t == 'object' && typeof t.then == 'function' ? 6 : 1),
      (Lt = t),
      be === null && (($e = 1), Zs(e, Zt(t, e.current))))
  }
  function _m() {
    var e = Dt.current
    return e === null
      ? !0
      : (_e & 4194048) === _e
        ? $t === null
        : (_e & 62914560) === _e || (_e & 536870912) !== 0
          ? e === $t
          : !1
  }
  function Tm() {
    var e = z.H
    return ((z.H = _i), e === null ? _i : e)
  }
  function Nm() {
    var e = z.A
    return ((z.A = qv), e)
  }
  function eu() {
    ;(($e = 4),
      Qn || ((_e & 4194048) !== _e && Dt.current !== null) || (ya = !0),
      ((Xn & 134217727) === 0 && (Cl & 134217727) === 0) || Re === null || Wn(Re, _e, Rt, !1))
  }
  function Gr(e, t, n) {
    var i = je
    je |= 2
    var r = Tm(),
      o = Nm()
    ;((Re !== e || _e !== t) && ((Fs = null), va(e, t)), (t = !1))
    var h = $e
    e: do
      try {
        if (ke !== 0 && be !== null) {
          var v = be,
            b = Lt
          switch (ke) {
            case 8:
              ;(Kr(), (h = 6))
              break e
            case 3:
            case 2:
            case 9:
            case 6:
              Dt.current === null && (t = !0)
              var w = ke
              if (((ke = 0), (Lt = null), ba(e, v, b, w), n && ya)) {
                h = 0
                break e
              }
              break
            default:
              ;((w = ke), (ke = 0), (Lt = null), ba(e, v, b, w))
          }
        }
        ;(Zv(), (h = $e))
        break
      } catch (D) {
        Sm(e, D)
      }
    while (!0)
    return (
      t && e.shellSuspendCounter++,
      (gn = Tl = null),
      (je = i),
      (z.H = r),
      (z.A = o),
      be === null && ((Re = null), (_e = 0), Ss()),
      h
    )
  }
  function Zv() {
    for (; be !== null; ) xm(be)
  }
  function Vv(e, t) {
    var n = je
    je |= 2
    var i = Tm(),
      r = Nm()
    Re !== e || _e !== t ? ((Fs = null), (Ws = jt() + 500), va(e, t)) : (ya = Ia(e, t))
    e: do
      try {
        if (ke !== 0 && be !== null) {
          t = be
          var o = Lt
          t: switch (ke) {
            case 1:
              ;((ke = 0), (Lt = null), ba(e, t, o, 1))
              break
            case 2:
            case 9:
              if (zd(o)) {
                ;((ke = 0), (Lt = null), Em(t))
                break
              }
              ;((t = function () {
                ;((ke !== 2 && ke !== 9) || Re !== e || (ke = 7), un(e))
              }),
                o.then(t, t))
              break e
            case 3:
              ke = 7
              break e
            case 4:
              ke = 5
              break e
            case 7:
              zd(o) ? ((ke = 0), (Lt = null), Em(t)) : ((ke = 0), (Lt = null), ba(e, t, o, 7))
              break
            case 5:
              var h = null
              switch (be.tag) {
                case 26:
                  h = be.memoizedState
                case 5:
                case 27:
                  var v = be
                  if (h ? fy(h) : v.stateNode.complete) {
                    ;((ke = 0), (Lt = null))
                    var b = v.sibling
                    if (b !== null) be = b
                    else {
                      var w = v.return
                      w !== null ? ((be = w), tu(w)) : (be = null)
                    }
                    break t
                  }
              }
              ;((ke = 0), (Lt = null), ba(e, t, o, 5))
              break
            case 6:
              ;((ke = 0), (Lt = null), ba(e, t, o, 6))
              break
            case 8:
              ;(Kr(), ($e = 6))
              break e
            default:
              throw Error(u(462))
          }
        }
        Kv()
        break
      } catch (D) {
        Sm(e, D)
      }
    while (!0)
    return ((gn = Tl = null), (z.H = i), (z.A = r), (je = n), be !== null ? 0 : ((Re = null), (_e = 0), Ss(), $e))
  }
  function Kv() {
    for (; be !== null && !hg(); ) xm(be)
  }
  function xm(e) {
    var t = Xh(e.alternate, e, On)
    ;((e.memoizedProps = e.pendingProps), t === null ? tu(e) : (be = t))
  }
  function Em(e) {
    var t = e,
      n = t.alternate
    switch (t.tag) {
      case 15:
      case 0:
        t = Zh(n, t, t.pendingProps, t.type, void 0, _e)
        break
      case 11:
        t = Zh(n, t, t.pendingProps, t.type.render, t.ref, _e)
        break
      case 5:
        sr(t)
      default:
        ;(Ih(n, t), (t = be = Nd(t, On)), (t = Xh(n, t, On)))
    }
    ;((e.memoizedProps = e.pendingProps), t === null ? tu(e) : (be = t))
  }
  function ba(e, t, n, i) {
    ;((gn = Tl = null), sr(t), (ca = null), (hi = 0))
    var r = t.return
    try {
      if (Mv(e, r, t, n, _e)) {
        ;(($e = 1), Zs(e, Zt(n, e.current)), (be = null))
        return
      }
    } catch (o) {
      if (r !== null) throw ((be = r), o)
      ;(($e = 1), Zs(e, Zt(n, e.current)), (be = null))
      return
    }
    t.flags & 32768
      ? (Ne || i === 1
          ? (e = !0)
          : ya || (_e & 536870912) !== 0
            ? (e = !1)
            : ((Qn = e = !0),
              (i === 2 || i === 9 || i === 3 || i === 6) &&
                ((i = Dt.current), i !== null && i.tag === 13 && (i.flags |= 16384))),
        Am(t, e))
      : tu(t)
  }
  function tu(e) {
    var t = e
    do {
      if ((t.flags & 32768) !== 0) {
        Am(t, Qn)
        return
      }
      e = t.return
      var n = Lv(t.alternate, t, On)
      if (n !== null) {
        be = n
        return
      }
      if (((t = t.sibling), t !== null)) {
        be = t
        return
      }
      be = t = e
    } while (t !== null)
    $e === 0 && ($e = 5)
  }
  function Am(e, t) {
    do {
      var n = Rv(e.alternate, e)
      if (n !== null) {
        ;((n.flags &= 32767), (be = n))
        return
      }
      if (
        ((n = e.return),
        n !== null && ((n.flags |= 32768), (n.subtreeFlags = 0), (n.deletions = null)),
        !t && ((e = e.sibling), e !== null))
      ) {
        be = e
        return
      }
      be = e = n
    } while (e !== null)
    ;(($e = 6), (be = null))
  }
  function Om(e, t, n, i, r, o, h, v, b) {
    e.cancelPendingCommit = null
    do nu()
    while (lt !== 0)
    if ((je & 6) !== 0) throw Error(u(327))
    if (t !== null) {
      if (t === e.current) throw Error(u(177))
      if (
        ((o = t.lanes | t.childLanes),
        (o |= Dc),
        Ng(e, n, o, h, v, b),
        e === Re && ((be = Re = null), (_e = 0)),
        (ga = t),
        (In = e),
        (jn = n),
        (Yr = o),
        (Zr = r),
        (pm = i),
        (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0
          ? ((e.callbackNode = null),
            (e.callbackPriority = 0),
            Xv(as, function () {
              return (Mm(), null)
            }))
          : ((e.callbackNode = null), (e.callbackPriority = 0)),
        (i = (t.flags & 13878) !== 0),
        (t.subtreeFlags & 13878) !== 0 || i)
      ) {
        ;((i = z.T), (z.T = null), (r = Q.p), (Q.p = 2), (h = je), (je |= 4))
        try {
          Uv(e, t, n)
        } finally {
          ;((je = h), (Q.p = r), (z.T = i))
        }
      }
      ;((lt = 1), jm(), wm(), km())
    }
  }
  function jm() {
    if (lt === 1) {
      lt = 0
      var e = In,
        t = ga,
        n = (t.flags & 13878) !== 0
      if ((t.subtreeFlags & 13878) !== 0 || n) {
        ;((n = z.T), (z.T = null))
        var i = Q.p
        Q.p = 2
        var r = je
        je |= 4
        try {
          cm(t, e)
          var o = lf,
            h = md(e.containerInfo),
            v = o.focusedElem,
            b = o.selectionRange
          if (h !== v && v && v.ownerDocument && hd(v.ownerDocument.documentElement, v)) {
            if (b !== null && jc(v)) {
              var w = b.start,
                D = b.end
              if ((D === void 0 && (D = w), 'selectionStart' in v))
                ((v.selectionStart = w), (v.selectionEnd = Math.min(D, v.value.length)))
              else {
                var q = v.ownerDocument || document,
                  k = (q && q.defaultView) || window
                if (k.getSelection) {
                  var C = k.getSelection(),
                    ee = v.textContent.length,
                    ue = Math.min(b.start, ee),
                    Le = b.end === void 0 ? ue : Math.min(b.end, ee)
                  !C.extend && ue > Le && ((h = Le), (Le = ue), (ue = h))
                  var x = dd(v, ue),
                    T = dd(v, Le)
                  if (
                    x &&
                    T &&
                    (C.rangeCount !== 1 ||
                      C.anchorNode !== x.node ||
                      C.anchorOffset !== x.offset ||
                      C.focusNode !== T.node ||
                      C.focusOffset !== T.offset)
                  ) {
                    var j = q.createRange()
                    ;(j.setStart(x.node, x.offset),
                      C.removeAllRanges(),
                      ue > Le
                        ? (C.addRange(j), C.extend(T.node, T.offset))
                        : (j.setEnd(T.node, T.offset), C.addRange(j)))
                  }
                }
              }
            }
            for (q = [], C = v; (C = C.parentNode); )
              C.nodeType === 1 && q.push({ element: C, left: C.scrollLeft, top: C.scrollTop })
            for (typeof v.focus == 'function' && v.focus(), v = 0; v < q.length; v++) {
              var R = q[v]
              ;((R.element.scrollLeft = R.left), (R.element.scrollTop = R.top))
            }
          }
          ;((mu = !!nf), (lf = nf = null))
        } finally {
          ;((je = r), (Q.p = i), (z.T = n))
        }
      }
      ;((e.current = t), (lt = 2))
    }
  }
  function wm() {
    if (lt === 2) {
      lt = 0
      var e = In,
        t = ga,
        n = (t.flags & 8772) !== 0
      if ((t.subtreeFlags & 8772) !== 0 || n) {
        ;((n = z.T), (z.T = null))
        var i = Q.p
        Q.p = 2
        var r = je
        je |= 4
        try {
          lm(e, t.alternate, t)
        } finally {
          ;((je = r), (Q.p = i), (z.T = n))
        }
      }
      lt = 3
    }
  }
  function km() {
    if (lt === 4 || lt === 3) {
      ;((lt = 0), mg())
      var e = In,
        t = ga,
        n = jn,
        i = pm
      ;(t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0
        ? (lt = 5)
        : ((lt = 0), (ga = In = null), Cm(e, e.pendingLanes))
      var r = e.pendingLanes
      if ((r === 0 && (Jn = null), rc(n), (t = t.stateNode), wt && typeof wt.onCommitFiberRoot == 'function'))
        try {
          wt.onCommitFiberRoot(Ja, t, void 0, (t.current.flags & 128) === 128)
        } catch {}
      if (i !== null) {
        ;((t = z.T), (r = Q.p), (Q.p = 2), (z.T = null))
        try {
          for (var o = e.onRecoverableError, h = 0; h < i.length; h++) {
            var v = i[h]
            o(v.value, { componentStack: v.stack })
          }
        } finally {
          ;((z.T = t), (Q.p = r))
        }
      }
      ;((jn & 3) !== 0 && nu(),
        un(e),
        (r = e.pendingLanes),
        (n & 261930) !== 0 && (r & 42) !== 0 ? (e === Vr ? ki++ : ((ki = 0), (Vr = e))) : (ki = 0),
        Ci(0))
    }
  }
  function Cm(e, t) {
    ;(e.pooledCacheLanes &= t) === 0 && ((t = e.pooledCache), t != null && ((e.pooledCache = null), oi(t)))
  }
  function nu() {
    return (jm(), wm(), km(), Mm())
  }
  function Mm() {
    if (lt !== 5) return !1
    var e = In,
      t = Yr
    Yr = 0
    var n = rc(jn),
      i = z.T,
      r = Q.p
    try {
      ;((Q.p = 32 > n ? 32 : n), (z.T = null), (n = Zr), (Zr = null))
      var o = In,
        h = jn
      if (((lt = 0), (ga = In = null), (jn = 0), (je & 6) !== 0)) throw Error(u(331))
      var v = je
      if (
        ((je |= 4),
        hm(o.current),
        fm(o, o.current, h, n),
        (je = v),
        Ci(0, !1),
        wt && typeof wt.onPostCommitFiberRoot == 'function')
      )
        try {
          wt.onPostCommitFiberRoot(Ja, o)
        } catch {}
      return !0
    } finally {
      ;((Q.p = r), (z.T = i), Cm(e, t))
    }
  }
  function Dm(e, t, n) {
    ;((t = Zt(n, t)), (t = _r(e.stateNode, t, 2)), (e = Vn(e, t, 2)), e !== null && (Wa(e, 2), un(e)))
  }
  function Ce(e, t, n) {
    if (e.tag === 3) Dm(e, e, n)
    else
      for (; t !== null; ) {
        if (t.tag === 3) {
          Dm(t, e, n)
          break
        } else if (t.tag === 1) {
          var i = t.stateNode
          if (
            typeof t.type.getDerivedStateFromError == 'function' ||
            (typeof i.componentDidCatch == 'function' && (Jn === null || !Jn.has(i)))
          ) {
            ;((e = Zt(n, e)), (n = zh(2)), (i = Vn(t, n, 2)), i !== null && (Lh(n, i, t, e), Wa(i, 2), un(i)))
            break
          }
        }
        t = t.return
      }
  }
  function $r(e, t, n) {
    var i = e.pingCache
    if (i === null) {
      i = e.pingCache = new Hv()
      var r = new Set()
      i.set(t, r)
    } else ((r = i.get(t)), r === void 0 && ((r = new Set()), i.set(t, r)))
    r.has(n) || ((Br = !0), r.add(n), (e = Gv.bind(null, e, t, n)), t.then(e, e))
  }
  function Gv(e, t, n) {
    var i = e.pingCache
    ;(i !== null && i.delete(t),
      (e.pingedLanes |= e.suspendedLanes & n),
      (e.warmLanes &= ~n),
      Re === e &&
        (_e & n) === n &&
        ($e === 4 || ($e === 3 && (_e & 62914560) === _e && 300 > jt() - Is) ? (je & 2) === 0 && va(e, 0) : (qr |= n),
        pa === _e && (pa = 0)),
      un(e))
  }
  function zm(e, t) {
    ;(t === 0 && (t = jo()), (e = bl(e, t)), e !== null && (Wa(e, t), un(e)))
  }
  function $v(e) {
    var t = e.memoizedState,
      n = 0
    ;(t !== null && (n = t.retryLane), zm(e, n))
  }
  function Qv(e, t) {
    var n = 0
    switch (e.tag) {
      case 31:
      case 13:
        var i = e.stateNode,
          r = e.memoizedState
        r !== null && (n = r.retryLane)
        break
      case 19:
        i = e.stateNode
        break
      case 22:
        i = e.stateNode._retryCache
        break
      default:
        throw Error(u(314))
    }
    ;(i !== null && i.delete(t), zm(e, n))
  }
  function Xv(e, t) {
    return ic(e, t)
  }
  var lu = null,
    Sa = null,
    Qr = !1,
    au = !1,
    Xr = !1,
    Fn = 0
  function un(e) {
    ;(e !== Sa && e.next === null && (Sa === null ? (lu = Sa = e) : (Sa = Sa.next = e)),
      (au = !0),
      Qr || ((Qr = !0), Iv()))
  }
  function Ci(e, t) {
    if (!Xr && au) {
      Xr = !0
      do
        for (var n = !1, i = lu; i !== null; ) {
          if (e !== 0) {
            var r = i.pendingLanes
            if (r === 0) var o = 0
            else {
              var h = i.suspendedLanes,
                v = i.pingedLanes
              ;((o = (1 << (31 - kt(42 | e) + 1)) - 1),
                (o &= r & ~(h & ~v)),
                (o = o & 201326741 ? (o & 201326741) | 1 : o ? o | 2 : 0))
            }
            o !== 0 && ((n = !0), Bm(i, o))
          } else
            ((o = _e),
              (o = cs(i, i === Re ? o : 0, i.cancelPendingCommit !== null || i.timeoutHandle !== -1)),
              (o & 3) === 0 || Ia(i, o) || ((n = !0), Bm(i, o)))
          i = i.next
        }
      while (n)
      Xr = !1
    }
  }
  function Jv() {
    Lm()
  }
  function Lm() {
    au = Qr = !1
    var e = 0
    Fn !== 0 && s0() && (e = Fn)
    for (var t = jt(), n = null, i = lu; i !== null; ) {
      var r = i.next,
        o = Rm(i, t)
      ;(o === 0
        ? ((i.next = null), n === null ? (lu = r) : (n.next = r), r === null && (Sa = n))
        : ((n = i), (e !== 0 || (o & 3) !== 0) && (au = !0)),
        (i = r))
    }
    ;((lt !== 0 && lt !== 5) || Ci(e), Fn !== 0 && (Fn = 0))
  }
  function Rm(e, t) {
    for (var n = e.suspendedLanes, i = e.pingedLanes, r = e.expirationTimes, o = e.pendingLanes & -62914561; 0 < o; ) {
      var h = 31 - kt(o),
        v = 1 << h,
        b = r[h]
      ;(b === -1 ? ((v & n) === 0 || (v & i) !== 0) && (r[h] = Tg(v, t)) : b <= t && (e.expiredLanes |= v), (o &= ~v))
    }
    if (
      ((t = Re),
      (n = _e),
      (n = cs(e, e === t ? n : 0, e.cancelPendingCommit !== null || e.timeoutHandle !== -1)),
      (i = e.callbackNode),
      n === 0 || (e === t && (ke === 2 || ke === 9)) || e.cancelPendingCommit !== null)
    )
      return (i !== null && i !== null && sc(i), (e.callbackNode = null), (e.callbackPriority = 0))
    if ((n & 3) === 0 || Ia(e, n)) {
      if (((t = n & -n), t === e.callbackPriority)) return t
      switch ((i !== null && sc(i), rc(n))) {
        case 2:
        case 8:
          n = Ao
          break
        case 32:
          n = as
          break
        case 268435456:
          n = Oo
          break
        default:
          n = as
      }
      return ((i = Um.bind(null, e)), (n = ic(n, i)), (e.callbackPriority = t), (e.callbackNode = n), t)
    }
    return (i !== null && i !== null && sc(i), (e.callbackPriority = 2), (e.callbackNode = null), 2)
  }
  function Um(e, t) {
    if (lt !== 0 && lt !== 5) return ((e.callbackNode = null), (e.callbackPriority = 0), null)
    var n = e.callbackNode
    if (nu() && e.callbackNode !== n) return null
    var i = _e
    return (
      (i = cs(e, e === Re ? i : 0, e.cancelPendingCommit !== null || e.timeoutHandle !== -1)),
      i === 0
        ? null
        : (vm(e, i, t), Rm(e, jt()), e.callbackNode != null && e.callbackNode === n ? Um.bind(null, e) : null)
    )
  }
  function Bm(e, t) {
    if (nu()) return null
    vm(e, t, !0)
  }
  function Iv() {
    c0(function () {
      ;(je & 6) !== 0 ? ic(Eo, Jv) : Lm()
    })
  }
  function Jr() {
    if (Fn === 0) {
      var e = ia
      ;(e === 0 && ((e = is), (is <<= 1), (is & 261888) === 0 && (is = 256)), (Fn = e))
    }
    return Fn
  }
  function qm(e) {
    return e == null || typeof e == 'symbol' || typeof e == 'boolean' ? null : typeof e == 'function' ? e : ds('' + e)
  }
  function Hm(e, t) {
    var n = t.ownerDocument.createElement('input')
    return (
      (n.name = t.name),
      (n.value = t.value),
      e.id && n.setAttribute('form', e.id),
      t.parentNode.insertBefore(n, t),
      (e = new FormData(e)),
      n.parentNode.removeChild(n),
      e
    )
  }
  function Wv(e, t, n, i, r) {
    if (t === 'submit' && n && n.stateNode === r) {
      var o = qm((r[vt] || null).action),
        h = i.submitter
      h &&
        ((t = (t = h[vt] || null) ? qm(t.formAction) : h.getAttribute('formAction')),
        t !== null && ((o = t), (h = null)))
      var v = new ps('action', 'action', null, i, r)
      e.push({
        event: v,
        listeners: [
          {
            instance: null,
            listener: function () {
              if (i.defaultPrevented) {
                if (Fn !== 0) {
                  var b = h ? Hm(r, h) : new FormData(r)
                  yr(n, { pending: !0, data: b, method: r.method, action: o }, null, b)
                }
              } else
                typeof o == 'function' &&
                  (v.preventDefault(),
                  (b = h ? Hm(r, h) : new FormData(r)),
                  yr(n, { pending: !0, data: b, method: r.method, action: o }, o, b))
            },
            currentTarget: r,
          },
        ],
      })
    }
  }
  for (var Ir = 0; Ir < Mc.length; Ir++) {
    var Wr = Mc[Ir],
      Fv = Wr.toLowerCase(),
      Pv = Wr[0].toUpperCase() + Wr.slice(1)
    Ft(Fv, 'on' + Pv)
  }
  ;(Ft(gd, 'onAnimationEnd'),
    Ft(vd, 'onAnimationIteration'),
    Ft(bd, 'onAnimationStart'),
    Ft('dblclick', 'onDoubleClick'),
    Ft('focusin', 'onFocus'),
    Ft('focusout', 'onBlur'),
    Ft(yv, 'onTransitionRun'),
    Ft(pv, 'onTransitionStart'),
    Ft(gv, 'onTransitionCancel'),
    Ft(Sd, 'onTransitionEnd'),
    Gl('onMouseEnter', ['mouseout', 'mouseover']),
    Gl('onMouseLeave', ['mouseout', 'mouseover']),
    Gl('onPointerEnter', ['pointerout', 'pointerover']),
    Gl('onPointerLeave', ['pointerout', 'pointerover']),
    yl('onChange', 'change click focusin focusout input keydown keyup selectionchange'.split(' ')),
    yl('onSelect', 'focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange'.split(' ')),
    yl('onBeforeInput', ['compositionend', 'keypress', 'textInput', 'paste']),
    yl('onCompositionEnd', 'compositionend focusout keydown keypress keyup mousedown'.split(' ')),
    yl('onCompositionStart', 'compositionstart focusout keydown keypress keyup mousedown'.split(' ')),
    yl('onCompositionUpdate', 'compositionupdate focusout keydown keypress keyup mousedown'.split(' ')))
  var Mi =
      'abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting'.split(
        ' '
      ),
    e0 = new Set('beforetoggle cancel close invalid load scroll scrollend toggle'.split(' ').concat(Mi))
  function Ym(e, t) {
    t = (t & 4) !== 0
    for (var n = 0; n < e.length; n++) {
      var i = e[n],
        r = i.event
      i = i.listeners
      e: {
        var o = void 0
        if (t)
          for (var h = i.length - 1; 0 <= h; h--) {
            var v = i[h],
              b = v.instance,
              w = v.currentTarget
            if (((v = v.listener), b !== o && r.isPropagationStopped())) break e
            ;((o = v), (r.currentTarget = w))
            try {
              o(r)
            } catch (D) {
              bs(D)
            }
            ;((r.currentTarget = null), (o = b))
          }
        else
          for (h = 0; h < i.length; h++) {
            if (
              ((v = i[h]),
              (b = v.instance),
              (w = v.currentTarget),
              (v = v.listener),
              b !== o && r.isPropagationStopped())
            )
              break e
            ;((o = v), (r.currentTarget = w))
            try {
              o(r)
            } catch (D) {
              bs(D)
            }
            ;((r.currentTarget = null), (o = b))
          }
      }
    }
  }
  function Se(e, t) {
    var n = t[fc]
    n === void 0 && (n = t[fc] = new Set())
    var i = e + '__bubble'
    n.has(i) || (Zm(t, e, 2, !1), n.add(i))
  }
  function Fr(e, t, n) {
    var i = 0
    ;(t && (i |= 4), Zm(n, e, i, t))
  }
  var iu = '_reactListening' + Math.random().toString(36).slice(2)
  function Pr(e) {
    if (!e[iu]) {
      ;((e[iu] = !0),
        Lo.forEach(function (n) {
          n !== 'selectionchange' && (e0.has(n) || Fr(n, !1, e), Fr(n, !0, e))
        }))
      var t = e.nodeType === 9 ? e : e.ownerDocument
      t === null || t[iu] || ((t[iu] = !0), Fr('selectionchange', !1, t))
    }
  }
  function Zm(e, t, n, i) {
    switch (gy(t)) {
      case 2:
        var r = j0
        break
      case 8:
        r = w0
        break
      default:
        r = yf
    }
    ;((n = r.bind(null, t, n, e)),
      (r = void 0),
      !bc || (t !== 'touchstart' && t !== 'touchmove' && t !== 'wheel') || (r = !0),
      i
        ? r !== void 0
          ? e.addEventListener(t, n, { capture: !0, passive: r })
          : e.addEventListener(t, n, !0)
        : r !== void 0
          ? e.addEventListener(t, n, { passive: r })
          : e.addEventListener(t, n, !1))
  }
  function ef(e, t, n, i, r) {
    var o = i
    if ((t & 1) === 0 && (t & 2) === 0 && i !== null)
      e: for (;;) {
        if (i === null) return
        var h = i.tag
        if (h === 3 || h === 4) {
          var v = i.stateNode.containerInfo
          if (v === r) break
          if (h === 4)
            for (h = i.return; h !== null; ) {
              var b = h.tag
              if ((b === 3 || b === 4) && h.stateNode.containerInfo === r) return
              h = h.return
            }
          for (; v !== null; ) {
            if (((h = Zl(v)), h === null)) return
            if (((b = h.tag), b === 5 || b === 6 || b === 26 || b === 27)) {
              i = o = h
              continue e
            }
            v = v.parentNode
          }
        }
        i = i.return
      }
    Qo(function () {
      var w = o,
        D = gc(n),
        q = []
      e: {
        var k = _d.get(e)
        if (k !== void 0) {
          var C = ps,
            ee = e
          switch (e) {
            case 'keypress':
              if (ms(n) === 0) break e
            case 'keydown':
            case 'keyup':
              C = Qg
              break
            case 'focusin':
              ;((ee = 'focus'), (C = Nc))
              break
            case 'focusout':
              ;((ee = 'blur'), (C = Nc))
              break
            case 'beforeblur':
            case 'afterblur':
              C = Nc
              break
            case 'click':
              if (n.button === 2) break e
            case 'auxclick':
            case 'dblclick':
            case 'mousedown':
            case 'mousemove':
            case 'mouseup':
            case 'mouseout':
            case 'mouseover':
            case 'contextmenu':
              C = Io
              break
            case 'drag':
            case 'dragend':
            case 'dragenter':
            case 'dragexit':
            case 'dragleave':
            case 'dragover':
            case 'dragstart':
            case 'drop':
              C = Lg
              break
            case 'touchcancel':
            case 'touchend':
            case 'touchmove':
            case 'touchstart':
              C = Ig
              break
            case gd:
            case vd:
            case bd:
              C = Bg
              break
            case Sd:
              C = Fg
              break
            case 'scroll':
            case 'scrollend':
              C = Dg
              break
            case 'wheel':
              C = ev
              break
            case 'copy':
            case 'cut':
            case 'paste':
              C = Hg
              break
            case 'gotpointercapture':
            case 'lostpointercapture':
            case 'pointercancel':
            case 'pointerdown':
            case 'pointermove':
            case 'pointerout':
            case 'pointerover':
            case 'pointerup':
              C = Fo
              break
            case 'toggle':
            case 'beforetoggle':
              C = nv
          }
          var ue = (t & 4) !== 0,
            Le = !ue && (e === 'scroll' || e === 'scrollend'),
            x = ue ? (k !== null ? k + 'Capture' : null) : k
          ue = []
          for (var T = w, j; T !== null; ) {
            var R = T
            if (
              ((j = R.stateNode),
              (R = R.tag),
              (R !== 5 && R !== 26 && R !== 27) ||
                j === null ||
                x === null ||
                ((R = ei(T, x)), R != null && ue.push(Di(T, R, j))),
              Le)
            )
              break
            T = T.return
          }
          0 < ue.length && ((k = new C(k, ee, null, n, D)), q.push({ event: k, listeners: ue }))
        }
      }
      if ((t & 7) === 0) {
        e: {
          if (
            ((k = e === 'mouseover' || e === 'pointerover'),
            (C = e === 'mouseout' || e === 'pointerout'),
            k && n !== pc && (ee = n.relatedTarget || n.fromElement) && (Zl(ee) || ee[Yl]))
          )
            break e
          if (
            (C || k) &&
            ((k = D.window === D ? D : (k = D.ownerDocument) ? k.defaultView || k.parentWindow : window),
            C
              ? ((ee = n.relatedTarget || n.toElement),
                (C = w),
                (ee = ee ? Zl(ee) : null),
                ee !== null &&
                  ((Le = f(ee)), (ue = ee.tag), ee !== Le || (ue !== 5 && ue !== 27 && ue !== 6)) &&
                  (ee = null))
              : ((C = null), (ee = w)),
            C !== ee)
          ) {
            if (
              ((ue = Io),
              (R = 'onMouseLeave'),
              (x = 'onMouseEnter'),
              (T = 'mouse'),
              (e === 'pointerout' || e === 'pointerover') &&
                ((ue = Fo), (R = 'onPointerLeave'), (x = 'onPointerEnter'), (T = 'pointer')),
              (Le = C == null ? k : Pa(C)),
              (j = ee == null ? k : Pa(ee)),
              (k = new ue(R, T + 'leave', C, n, D)),
              (k.target = Le),
              (k.relatedTarget = j),
              (R = null),
              Zl(D) === w &&
                ((ue = new ue(x, T + 'enter', ee, n, D)), (ue.target = j), (ue.relatedTarget = Le), (R = ue)),
              (Le = R),
              C && ee)
            )
              t: {
                for (ue = t0, x = C, T = ee, j = 0, R = x; R; R = ue(R)) j++
                R = 0
                for (var se = T; se; se = ue(se)) R++
                for (; 0 < j - R; ) ((x = ue(x)), j--)
                for (; 0 < R - j; ) ((T = ue(T)), R--)
                for (; j--; ) {
                  if (x === T || (T !== null && x === T.alternate)) {
                    ue = x
                    break t
                  }
                  ;((x = ue(x)), (T = ue(T)))
                }
                ue = null
              }
            else ue = null
            ;(C !== null && Vm(q, k, C, ue, !1), ee !== null && Le !== null && Vm(q, Le, ee, ue, !0))
          }
        }
        e: {
          if (
            ((k = w ? Pa(w) : window),
            (C = k.nodeName && k.nodeName.toLowerCase()),
            C === 'select' || (C === 'input' && k.type === 'file'))
          )
            var Ee = sd
          else if (ad(k))
            if (ud) Ee = dv
            else {
              Ee = fv
              var le = rv
            }
          else
            ((C = k.nodeName),
              !C || C.toLowerCase() !== 'input' || (k.type !== 'checkbox' && k.type !== 'radio')
                ? w && yc(w.elementType) && (Ee = sd)
                : (Ee = ov))
          if (Ee && (Ee = Ee(e, w))) {
            id(q, Ee, n, D)
            break e
          }
          ;(le && le(e, k, w),
            e === 'focusout' && w && k.type === 'number' && w.memoizedProps.value != null && mc(k, 'number', k.value))
        }
        switch (((le = w ? Pa(w) : window), e)) {
          case 'focusin':
            ;(ad(le) || le.contentEditable === 'true') && ((Wl = le), (wc = w), (ci = null))
            break
          case 'focusout':
            ci = wc = Wl = null
            break
          case 'mousedown':
            kc = !0
            break
          case 'contextmenu':
          case 'mouseup':
          case 'dragend':
            ;((kc = !1), yd(q, n, D))
            break
          case 'selectionchange':
            if (mv) break
          case 'keydown':
          case 'keyup':
            yd(q, n, D)
        }
        var ye
        if (Ec)
          e: {
            switch (e) {
              case 'compositionstart':
                var Te = 'onCompositionStart'
                break e
              case 'compositionend':
                Te = 'onCompositionEnd'
                break e
              case 'compositionupdate':
                Te = 'onCompositionUpdate'
                break e
            }
            Te = void 0
          }
        else
          Il
            ? nd(e, n) && (Te = 'onCompositionEnd')
            : e === 'keydown' && n.keyCode === 229 && (Te = 'onCompositionStart')
        ;(Te &&
          (Po &&
            n.locale !== 'ko' &&
            (Il || Te !== 'onCompositionStart'
              ? Te === 'onCompositionEnd' && Il && (ye = Xo())
              : ((Rn = D), (Sc = 'value' in Rn ? Rn.value : Rn.textContent), (Il = !0))),
          (le = su(w, Te)),
          0 < le.length &&
            ((Te = new Wo(Te, e, null, n, D)),
            q.push({ event: Te, listeners: le }),
            ye ? (Te.data = ye) : ((ye = ld(n)), ye !== null && (Te.data = ye)))),
          (ye = av ? iv(e, n) : sv(e, n)) &&
            ((Te = su(w, 'onBeforeInput')),
            0 < Te.length &&
              ((le = new Wo('onBeforeInput', 'beforeinput', null, n, D)),
              q.push({ event: le, listeners: Te }),
              (le.data = ye))),
          Wv(q, e, w, n, D))
      }
      Ym(q, t)
    })
  }
  function Di(e, t, n) {
    return { instance: e, listener: t, currentTarget: n }
  }
  function su(e, t) {
    for (var n = t + 'Capture', i = []; e !== null; ) {
      var r = e,
        o = r.stateNode
      if (
        ((r = r.tag),
        (r !== 5 && r !== 26 && r !== 27) ||
          o === null ||
          ((r = ei(e, n)), r != null && i.unshift(Di(e, r, o)), (r = ei(e, t)), r != null && i.push(Di(e, r, o))),
        e.tag === 3)
      )
        return i
      e = e.return
    }
    return []
  }
  function t0(e) {
    if (e === null) return null
    do e = e.return
    while (e && e.tag !== 5 && e.tag !== 27)
    return e || null
  }
  function Vm(e, t, n, i, r) {
    for (var o = t._reactName, h = []; n !== null && n !== i; ) {
      var v = n,
        b = v.alternate,
        w = v.stateNode
      if (((v = v.tag), b !== null && b === i)) break
      ;((v !== 5 && v !== 26 && v !== 27) ||
        w === null ||
        ((b = w),
        r
          ? ((w = ei(n, o)), w != null && h.unshift(Di(n, w, b)))
          : r || ((w = ei(n, o)), w != null && h.push(Di(n, w, b)))),
        (n = n.return))
    }
    h.length !== 0 && e.push({ event: t, listeners: h })
  }
  var n0 = /\r\n?/g,
    l0 = /\u0000|\uFFFD/g
  function Km(e) {
    return (typeof e == 'string' ? e : '' + e)
      .replace(
        n0,
        `
`
      )
      .replace(l0, '')
  }
  function Gm(e, t) {
    return ((t = Km(t)), Km(e) === t)
  }
  function ze(e, t, n, i, r, o) {
    switch (n) {
      case 'children':
        typeof i == 'string'
          ? t === 'body' || (t === 'textarea' && i === '') || Ql(e, i)
          : (typeof i == 'number' || typeof i == 'bigint') && t !== 'body' && Ql(e, '' + i)
        break
      case 'className':
        fs(e, 'class', i)
        break
      case 'tabIndex':
        fs(e, 'tabindex', i)
        break
      case 'dir':
      case 'role':
      case 'viewBox':
      case 'width':
      case 'height':
        fs(e, n, i)
        break
      case 'style':
        Go(e, i, o)
        break
      case 'data':
        if (t !== 'object') {
          fs(e, 'data', i)
          break
        }
      case 'src':
      case 'href':
        if (i === '' && (t !== 'a' || n !== 'href')) {
          e.removeAttribute(n)
          break
        }
        if (i == null || typeof i == 'function' || typeof i == 'symbol' || typeof i == 'boolean') {
          e.removeAttribute(n)
          break
        }
        ;((i = ds('' + i)), e.setAttribute(n, i))
        break
      case 'action':
      case 'formAction':
        if (typeof i == 'function') {
          e.setAttribute(
            n,
            "javascript:throw new Error('A React form was unexpectedly submitted. If you called form.submit() manually, consider using form.requestSubmit() instead. If you\\'re trying to use event.stopPropagation() in a submit event handler, consider also calling event.preventDefault().')"
          )
          break
        } else
          typeof o == 'function' &&
            (n === 'formAction'
              ? (t !== 'input' && ze(e, t, 'name', r.name, r, null),
                ze(e, t, 'formEncType', r.formEncType, r, null),
                ze(e, t, 'formMethod', r.formMethod, r, null),
                ze(e, t, 'formTarget', r.formTarget, r, null))
              : (ze(e, t, 'encType', r.encType, r, null),
                ze(e, t, 'method', r.method, r, null),
                ze(e, t, 'target', r.target, r, null)))
        if (i == null || typeof i == 'symbol' || typeof i == 'boolean') {
          e.removeAttribute(n)
          break
        }
        ;((i = ds('' + i)), e.setAttribute(n, i))
        break
      case 'onClick':
        i != null && (e.onclick = hn)
        break
      case 'onScroll':
        i != null && Se('scroll', e)
        break
      case 'onScrollEnd':
        i != null && Se('scrollend', e)
        break
      case 'dangerouslySetInnerHTML':
        if (i != null) {
          if (typeof i != 'object' || !('__html' in i)) throw Error(u(61))
          if (((n = i.__html), n != null)) {
            if (r.children != null) throw Error(u(60))
            e.innerHTML = n
          }
        }
        break
      case 'multiple':
        e.multiple = i && typeof i != 'function' && typeof i != 'symbol'
        break
      case 'muted':
        e.muted = i && typeof i != 'function' && typeof i != 'symbol'
        break
      case 'suppressContentEditableWarning':
      case 'suppressHydrationWarning':
      case 'defaultValue':
      case 'defaultChecked':
      case 'innerHTML':
      case 'ref':
        break
      case 'autoFocus':
        break
      case 'xlinkHref':
        if (i == null || typeof i == 'function' || typeof i == 'boolean' || typeof i == 'symbol') {
          e.removeAttribute('xlink:href')
          break
        }
        ;((n = ds('' + i)), e.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', n))
        break
      case 'contentEditable':
      case 'spellCheck':
      case 'draggable':
      case 'value':
      case 'autoReverse':
      case 'externalResourcesRequired':
      case 'focusable':
      case 'preserveAlpha':
        i != null && typeof i != 'function' && typeof i != 'symbol' ? e.setAttribute(n, '' + i) : e.removeAttribute(n)
        break
      case 'inert':
      case 'allowFullScreen':
      case 'async':
      case 'autoPlay':
      case 'controls':
      case 'default':
      case 'defer':
      case 'disabled':
      case 'disablePictureInPicture':
      case 'disableRemotePlayback':
      case 'formNoValidate':
      case 'hidden':
      case 'loop':
      case 'noModule':
      case 'noValidate':
      case 'open':
      case 'playsInline':
      case 'readOnly':
      case 'required':
      case 'reversed':
      case 'scoped':
      case 'seamless':
      case 'itemScope':
        i && typeof i != 'function' && typeof i != 'symbol' ? e.setAttribute(n, '') : e.removeAttribute(n)
        break
      case 'capture':
      case 'download':
        i === !0
          ? e.setAttribute(n, '')
          : i !== !1 && i != null && typeof i != 'function' && typeof i != 'symbol'
            ? e.setAttribute(n, i)
            : e.removeAttribute(n)
        break
      case 'cols':
      case 'rows':
      case 'size':
      case 'span':
        i != null && typeof i != 'function' && typeof i != 'symbol' && !isNaN(i) && 1 <= i
          ? e.setAttribute(n, i)
          : e.removeAttribute(n)
        break
      case 'rowSpan':
      case 'start':
        i == null || typeof i == 'function' || typeof i == 'symbol' || isNaN(i)
          ? e.removeAttribute(n)
          : e.setAttribute(n, i)
        break
      case 'popover':
        ;(Se('beforetoggle', e), Se('toggle', e), rs(e, 'popover', i))
        break
      case 'xlinkActuate':
        dn(e, 'http://www.w3.org/1999/xlink', 'xlink:actuate', i)
        break
      case 'xlinkArcrole':
        dn(e, 'http://www.w3.org/1999/xlink', 'xlink:arcrole', i)
        break
      case 'xlinkRole':
        dn(e, 'http://www.w3.org/1999/xlink', 'xlink:role', i)
        break
      case 'xlinkShow':
        dn(e, 'http://www.w3.org/1999/xlink', 'xlink:show', i)
        break
      case 'xlinkTitle':
        dn(e, 'http://www.w3.org/1999/xlink', 'xlink:title', i)
        break
      case 'xlinkType':
        dn(e, 'http://www.w3.org/1999/xlink', 'xlink:type', i)
        break
      case 'xmlBase':
        dn(e, 'http://www.w3.org/XML/1998/namespace', 'xml:base', i)
        break
      case 'xmlLang':
        dn(e, 'http://www.w3.org/XML/1998/namespace', 'xml:lang', i)
        break
      case 'xmlSpace':
        dn(e, 'http://www.w3.org/XML/1998/namespace', 'xml:space', i)
        break
      case 'is':
        rs(e, 'is', i)
        break
      case 'innerText':
      case 'textContent':
        break
      default:
        ;(!(2 < n.length) || (n[0] !== 'o' && n[0] !== 'O') || (n[1] !== 'n' && n[1] !== 'N')) &&
          ((n = Cg.get(n) || n), rs(e, n, i))
    }
  }
  function tf(e, t, n, i, r, o) {
    switch (n) {
      case 'style':
        Go(e, i, o)
        break
      case 'dangerouslySetInnerHTML':
        if (i != null) {
          if (typeof i != 'object' || !('__html' in i)) throw Error(u(61))
          if (((n = i.__html), n != null)) {
            if (r.children != null) throw Error(u(60))
            e.innerHTML = n
          }
        }
        break
      case 'children':
        typeof i == 'string' ? Ql(e, i) : (typeof i == 'number' || typeof i == 'bigint') && Ql(e, '' + i)
        break
      case 'onScroll':
        i != null && Se('scroll', e)
        break
      case 'onScrollEnd':
        i != null && Se('scrollend', e)
        break
      case 'onClick':
        i != null && (e.onclick = hn)
        break
      case 'suppressContentEditableWarning':
      case 'suppressHydrationWarning':
      case 'innerHTML':
      case 'ref':
        break
      case 'innerText':
      case 'textContent':
        break
      default:
        if (!Ro.hasOwnProperty(n))
          e: {
            if (
              n[0] === 'o' &&
              n[1] === 'n' &&
              ((r = n.endsWith('Capture')),
              (t = n.slice(2, r ? n.length - 7 : void 0)),
              (o = e[vt] || null),
              (o = o != null ? o[n] : null),
              typeof o == 'function' && e.removeEventListener(t, o, r),
              typeof i == 'function')
            ) {
              ;(typeof o != 'function' &&
                o !== null &&
                (n in e ? (e[n] = null) : e.hasAttribute(n) && e.removeAttribute(n)),
                e.addEventListener(t, i, r))
              break e
            }
            n in e ? (e[n] = i) : i === !0 ? e.setAttribute(n, '') : rs(e, n, i)
          }
    }
  }
  function ft(e, t, n) {
    switch (t) {
      case 'div':
      case 'span':
      case 'svg':
      case 'path':
      case 'a':
      case 'g':
      case 'p':
      case 'li':
        break
      case 'img':
        ;(Se('error', e), Se('load', e))
        var i = !1,
          r = !1,
          o
        for (o in n)
          if (n.hasOwnProperty(o)) {
            var h = n[o]
            if (h != null)
              switch (o) {
                case 'src':
                  i = !0
                  break
                case 'srcSet':
                  r = !0
                  break
                case 'children':
                case 'dangerouslySetInnerHTML':
                  throw Error(u(137, t))
                default:
                  ze(e, t, o, h, n, null)
              }
          }
        ;(r && ze(e, t, 'srcSet', n.srcSet, n, null), i && ze(e, t, 'src', n.src, n, null))
        return
      case 'input':
        Se('invalid', e)
        var v = (o = h = r = null),
          b = null,
          w = null
        for (i in n)
          if (n.hasOwnProperty(i)) {
            var D = n[i]
            if (D != null)
              switch (i) {
                case 'name':
                  r = D
                  break
                case 'type':
                  h = D
                  break
                case 'checked':
                  b = D
                  break
                case 'defaultChecked':
                  w = D
                  break
                case 'value':
                  o = D
                  break
                case 'defaultValue':
                  v = D
                  break
                case 'children':
                case 'dangerouslySetInnerHTML':
                  if (D != null) throw Error(u(137, t))
                  break
                default:
                  ze(e, t, i, D, n, null)
              }
          }
        Yo(e, o, v, b, w, h, r, !1)
        return
      case 'select':
        ;(Se('invalid', e), (i = h = o = null))
        for (r in n)
          if (n.hasOwnProperty(r) && ((v = n[r]), v != null))
            switch (r) {
              case 'value':
                o = v
                break
              case 'defaultValue':
                h = v
                break
              case 'multiple':
                i = v
              default:
                ze(e, t, r, v, n, null)
            }
        ;((t = o), (n = h), (e.multiple = !!i), t != null ? $l(e, !!i, t, !1) : n != null && $l(e, !!i, n, !0))
        return
      case 'textarea':
        ;(Se('invalid', e), (o = r = i = null))
        for (h in n)
          if (n.hasOwnProperty(h) && ((v = n[h]), v != null))
            switch (h) {
              case 'value':
                i = v
                break
              case 'defaultValue':
                r = v
                break
              case 'children':
                o = v
                break
              case 'dangerouslySetInnerHTML':
                if (v != null) throw Error(u(91))
                break
              default:
                ze(e, t, h, v, n, null)
            }
        Vo(e, i, r, o)
        return
      case 'option':
        for (b in n)
          if (n.hasOwnProperty(b) && ((i = n[b]), i != null))
            switch (b) {
              case 'selected':
                e.selected = i && typeof i != 'function' && typeof i != 'symbol'
                break
              default:
                ze(e, t, b, i, n, null)
            }
        return
      case 'dialog':
        ;(Se('beforetoggle', e), Se('toggle', e), Se('cancel', e), Se('close', e))
        break
      case 'iframe':
      case 'object':
        Se('load', e)
        break
      case 'video':
      case 'audio':
        for (i = 0; i < Mi.length; i++) Se(Mi[i], e)
        break
      case 'image':
        ;(Se('error', e), Se('load', e))
        break
      case 'details':
        Se('toggle', e)
        break
      case 'embed':
      case 'source':
      case 'link':
        ;(Se('error', e), Se('load', e))
      case 'area':
      case 'base':
      case 'br':
      case 'col':
      case 'hr':
      case 'keygen':
      case 'meta':
      case 'param':
      case 'track':
      case 'wbr':
      case 'menuitem':
        for (w in n)
          if (n.hasOwnProperty(w) && ((i = n[w]), i != null))
            switch (w) {
              case 'children':
              case 'dangerouslySetInnerHTML':
                throw Error(u(137, t))
              default:
                ze(e, t, w, i, n, null)
            }
        return
      default:
        if (yc(t)) {
          for (D in n) n.hasOwnProperty(D) && ((i = n[D]), i !== void 0 && tf(e, t, D, i, n, void 0))
          return
        }
    }
    for (v in n) n.hasOwnProperty(v) && ((i = n[v]), i != null && ze(e, t, v, i, n, null))
  }
  function a0(e, t, n, i) {
    switch (t) {
      case 'div':
      case 'span':
      case 'svg':
      case 'path':
      case 'a':
      case 'g':
      case 'p':
      case 'li':
        break
      case 'input':
        var r = null,
          o = null,
          h = null,
          v = null,
          b = null,
          w = null,
          D = null
        for (C in n) {
          var q = n[C]
          if (n.hasOwnProperty(C) && q != null)
            switch (C) {
              case 'checked':
                break
              case 'value':
                break
              case 'defaultValue':
                b = q
              default:
                i.hasOwnProperty(C) || ze(e, t, C, null, i, q)
            }
        }
        for (var k in i) {
          var C = i[k]
          if (((q = n[k]), i.hasOwnProperty(k) && (C != null || q != null)))
            switch (k) {
              case 'type':
                o = C
                break
              case 'name':
                r = C
                break
              case 'checked':
                w = C
                break
              case 'defaultChecked':
                D = C
                break
              case 'value':
                h = C
                break
              case 'defaultValue':
                v = C
                break
              case 'children':
              case 'dangerouslySetInnerHTML':
                if (C != null) throw Error(u(137, t))
                break
              default:
                C !== q && ze(e, t, k, C, i, q)
            }
        }
        hc(e, h, v, b, w, D, o, r)
        return
      case 'select':
        C = h = v = k = null
        for (o in n)
          if (((b = n[o]), n.hasOwnProperty(o) && b != null))
            switch (o) {
              case 'value':
                break
              case 'multiple':
                C = b
              default:
                i.hasOwnProperty(o) || ze(e, t, o, null, i, b)
            }
        for (r in i)
          if (((o = i[r]), (b = n[r]), i.hasOwnProperty(r) && (o != null || b != null)))
            switch (r) {
              case 'value':
                k = o
                break
              case 'defaultValue':
                v = o
                break
              case 'multiple':
                h = o
              default:
                o !== b && ze(e, t, r, o, i, b)
            }
        ;((t = v),
          (n = h),
          (i = C),
          k != null ? $l(e, !!n, k, !1) : !!i != !!n && (t != null ? $l(e, !!n, t, !0) : $l(e, !!n, n ? [] : '', !1)))
        return
      case 'textarea':
        C = k = null
        for (v in n)
          if (((r = n[v]), n.hasOwnProperty(v) && r != null && !i.hasOwnProperty(v)))
            switch (v) {
              case 'value':
                break
              case 'children':
                break
              default:
                ze(e, t, v, null, i, r)
            }
        for (h in i)
          if (((r = i[h]), (o = n[h]), i.hasOwnProperty(h) && (r != null || o != null)))
            switch (h) {
              case 'value':
                k = r
                break
              case 'defaultValue':
                C = r
                break
              case 'children':
                break
              case 'dangerouslySetInnerHTML':
                if (r != null) throw Error(u(91))
                break
              default:
                r !== o && ze(e, t, h, r, i, o)
            }
        Zo(e, k, C)
        return
      case 'option':
        for (var ee in n)
          if (((k = n[ee]), n.hasOwnProperty(ee) && k != null && !i.hasOwnProperty(ee)))
            switch (ee) {
              case 'selected':
                e.selected = !1
                break
              default:
                ze(e, t, ee, null, i, k)
            }
        for (b in i)
          if (((k = i[b]), (C = n[b]), i.hasOwnProperty(b) && k !== C && (k != null || C != null)))
            switch (b) {
              case 'selected':
                e.selected = k && typeof k != 'function' && typeof k != 'symbol'
                break
              default:
                ze(e, t, b, k, i, C)
            }
        return
      case 'img':
      case 'link':
      case 'area':
      case 'base':
      case 'br':
      case 'col':
      case 'embed':
      case 'hr':
      case 'keygen':
      case 'meta':
      case 'param':
      case 'source':
      case 'track':
      case 'wbr':
      case 'menuitem':
        for (var ue in n)
          ((k = n[ue]), n.hasOwnProperty(ue) && k != null && !i.hasOwnProperty(ue) && ze(e, t, ue, null, i, k))
        for (w in i)
          if (((k = i[w]), (C = n[w]), i.hasOwnProperty(w) && k !== C && (k != null || C != null)))
            switch (w) {
              case 'children':
              case 'dangerouslySetInnerHTML':
                if (k != null) throw Error(u(137, t))
                break
              default:
                ze(e, t, w, k, i, C)
            }
        return
      default:
        if (yc(t)) {
          for (var Le in n)
            ((k = n[Le]), n.hasOwnProperty(Le) && k !== void 0 && !i.hasOwnProperty(Le) && tf(e, t, Le, void 0, i, k))
          for (D in i)
            ((k = i[D]),
              (C = n[D]),
              !i.hasOwnProperty(D) || k === C || (k === void 0 && C === void 0) || tf(e, t, D, k, i, C))
          return
        }
    }
    for (var x in n) ((k = n[x]), n.hasOwnProperty(x) && k != null && !i.hasOwnProperty(x) && ze(e, t, x, null, i, k))
    for (q in i)
      ((k = i[q]), (C = n[q]), !i.hasOwnProperty(q) || k === C || (k == null && C == null) || ze(e, t, q, k, i, C))
  }
  function $m(e) {
    switch (e) {
      case 'css':
      case 'script':
      case 'font':
      case 'img':
      case 'image':
      case 'input':
      case 'link':
        return !0
      default:
        return !1
    }
  }
  function i0() {
    if (typeof performance.getEntriesByType == 'function') {
      for (var e = 0, t = 0, n = performance.getEntriesByType('resource'), i = 0; i < n.length; i++) {
        var r = n[i],
          o = r.transferSize,
          h = r.initiatorType,
          v = r.duration
        if (o && v && $m(h)) {
          for (h = 0, v = r.responseEnd, i += 1; i < n.length; i++) {
            var b = n[i],
              w = b.startTime
            if (w > v) break
            var D = b.transferSize,
              q = b.initiatorType
            D && $m(q) && ((b = b.responseEnd), (h += D * (b < v ? 1 : (v - w) / (b - w))))
          }
          if ((--i, (t += (8 * (o + h)) / (r.duration / 1e3)), e++, 10 < e)) break
        }
      }
      if (0 < e) return t / e / 1e6
    }
    return navigator.connection && ((e = navigator.connection.downlink), typeof e == 'number') ? e : 5
  }
  var nf = null,
    lf = null
  function uu(e) {
    return e.nodeType === 9 ? e : e.ownerDocument
  }
  function Qm(e) {
    switch (e) {
      case 'http://www.w3.org/2000/svg':
        return 1
      case 'http://www.w3.org/1998/Math/MathML':
        return 2
      default:
        return 0
    }
  }
  function Xm(e, t) {
    if (e === 0)
      switch (t) {
        case 'svg':
          return 1
        case 'math':
          return 2
        default:
          return 0
      }
    return e === 1 && t === 'foreignObject' ? 0 : e
  }
  function af(e, t) {
    return (
      e === 'textarea' ||
      e === 'noscript' ||
      typeof t.children == 'string' ||
      typeof t.children == 'number' ||
      typeof t.children == 'bigint' ||
      (typeof t.dangerouslySetInnerHTML == 'object' &&
        t.dangerouslySetInnerHTML !== null &&
        t.dangerouslySetInnerHTML.__html != null)
    )
  }
  var sf = null
  function s0() {
    var e = window.event
    return e && e.type === 'popstate' ? (e === sf ? !1 : ((sf = e), !0)) : ((sf = null), !1)
  }
  var Jm = typeof setTimeout == 'function' ? setTimeout : void 0,
    u0 = typeof clearTimeout == 'function' ? clearTimeout : void 0,
    Im = typeof Promise == 'function' ? Promise : void 0,
    c0 =
      typeof queueMicrotask == 'function'
        ? queueMicrotask
        : typeof Im < 'u'
          ? function (e) {
              return Im.resolve(null).then(e).catch(r0)
            }
          : Jm
  function r0(e) {
    setTimeout(function () {
      throw e
    })
  }
  function Pn(e) {
    return e === 'head'
  }
  function Wm(e, t) {
    var n = t,
      i = 0
    do {
      var r = n.nextSibling
      if ((e.removeChild(n), r && r.nodeType === 8))
        if (((n = r.data), n === '/$' || n === '/&')) {
          if (i === 0) {
            ;(e.removeChild(r), xa(t))
            return
          }
          i--
        } else if (n === '$' || n === '$?' || n === '$~' || n === '$!' || n === '&') i++
        else if (n === 'html') zi(e.ownerDocument.documentElement)
        else if (n === 'head') {
          ;((n = e.ownerDocument.head), zi(n))
          for (var o = n.firstChild; o; ) {
            var h = o.nextSibling,
              v = o.nodeName
            ;(o[Fa] ||
              v === 'SCRIPT' ||
              v === 'STYLE' ||
              (v === 'LINK' && o.rel.toLowerCase() === 'stylesheet') ||
              n.removeChild(o),
              (o = h))
          }
        } else n === 'body' && zi(e.ownerDocument.body)
      n = r
    } while (n)
    xa(t)
  }
  function Fm(e, t) {
    var n = e
    e = 0
    do {
      var i = n.nextSibling
      if (
        (n.nodeType === 1
          ? t
            ? ((n._stashedDisplay = n.style.display), (n.style.display = 'none'))
            : ((n.style.display = n._stashedDisplay || ''),
              n.getAttribute('style') === '' && n.removeAttribute('style'))
          : n.nodeType === 3 &&
            (t ? ((n._stashedText = n.nodeValue), (n.nodeValue = '')) : (n.nodeValue = n._stashedText || '')),
        i && i.nodeType === 8)
      )
        if (((n = i.data), n === '/$')) {
          if (e === 0) break
          e--
        } else (n !== '$' && n !== '$?' && n !== '$~' && n !== '$!') || e++
      n = i
    } while (n)
  }
  function uf(e) {
    var t = e.firstChild
    for (t && t.nodeType === 10 && (t = t.nextSibling); t; ) {
      var n = t
      switch (((t = t.nextSibling), n.nodeName)) {
        case 'HTML':
        case 'HEAD':
        case 'BODY':
          ;(uf(n), oc(n))
          continue
        case 'SCRIPT':
        case 'STYLE':
          continue
        case 'LINK':
          if (n.rel.toLowerCase() === 'stylesheet') continue
      }
      e.removeChild(n)
    }
  }
  function f0(e, t, n, i) {
    for (; e.nodeType === 1; ) {
      var r = n
      if (e.nodeName.toLowerCase() !== t.toLowerCase()) {
        if (!i && (e.nodeName !== 'INPUT' || e.type !== 'hidden')) break
      } else if (i) {
        if (!e[Fa])
          switch (t) {
            case 'meta':
              if (!e.hasAttribute('itemprop')) break
              return e
            case 'link':
              if (((o = e.getAttribute('rel')), o === 'stylesheet' && e.hasAttribute('data-precedence'))) break
              if (
                o !== r.rel ||
                e.getAttribute('href') !== (r.href == null || r.href === '' ? null : r.href) ||
                e.getAttribute('crossorigin') !== (r.crossOrigin == null ? null : r.crossOrigin) ||
                e.getAttribute('title') !== (r.title == null ? null : r.title)
              )
                break
              return e
            case 'style':
              if (e.hasAttribute('data-precedence')) break
              return e
            case 'script':
              if (
                ((o = e.getAttribute('src')),
                (o !== (r.src == null ? null : r.src) ||
                  e.getAttribute('type') !== (r.type == null ? null : r.type) ||
                  e.getAttribute('crossorigin') !== (r.crossOrigin == null ? null : r.crossOrigin)) &&
                  o &&
                  e.hasAttribute('async') &&
                  !e.hasAttribute('itemprop'))
              )
                break
              return e
            default:
              return e
          }
      } else if (t === 'input' && e.type === 'hidden') {
        var o = r.name == null ? null : '' + r.name
        if (r.type === 'hidden' && e.getAttribute('name') === o) return e
      } else return e
      if (((e = Qt(e.nextSibling)), e === null)) break
    }
    return null
  }
  function o0(e, t, n) {
    if (t === '') return null
    for (; e.nodeType !== 3; )
      if (
        ((e.nodeType !== 1 || e.nodeName !== 'INPUT' || e.type !== 'hidden') && !n) ||
        ((e = Qt(e.nextSibling)), e === null)
      )
        return null
    return e
  }
  function Pm(e, t) {
    for (; e.nodeType !== 8; )
      if (
        ((e.nodeType !== 1 || e.nodeName !== 'INPUT' || e.type !== 'hidden') && !t) ||
        ((e = Qt(e.nextSibling)), e === null)
      )
        return null
    return e
  }
  function cf(e) {
    return e.data === '$?' || e.data === '$~'
  }
  function rf(e) {
    return e.data === '$!' || (e.data === '$?' && e.ownerDocument.readyState !== 'loading')
  }
  function d0(e, t) {
    var n = e.ownerDocument
    if (e.data === '$~') e._reactRetry = t
    else if (e.data !== '$?' || n.readyState !== 'loading') t()
    else {
      var i = function () {
        ;(t(), n.removeEventListener('DOMContentLoaded', i))
      }
      ;(n.addEventListener('DOMContentLoaded', i), (e._reactRetry = i))
    }
  }
  function Qt(e) {
    for (; e != null; e = e.nextSibling) {
      var t = e.nodeType
      if (t === 1 || t === 3) break
      if (t === 8) {
        if (((t = e.data), t === '$' || t === '$!' || t === '$?' || t === '$~' || t === '&' || t === 'F!' || t === 'F'))
          break
        if (t === '/$' || t === '/&') return null
      }
    }
    return e
  }
  var ff = null
  function ey(e) {
    e = e.nextSibling
    for (var t = 0; e; ) {
      if (e.nodeType === 8) {
        var n = e.data
        if (n === '/$' || n === '/&') {
          if (t === 0) return Qt(e.nextSibling)
          t--
        } else (n !== '$' && n !== '$!' && n !== '$?' && n !== '$~' && n !== '&') || t++
      }
      e = e.nextSibling
    }
    return null
  }
  function ty(e) {
    e = e.previousSibling
    for (var t = 0; e; ) {
      if (e.nodeType === 8) {
        var n = e.data
        if (n === '$' || n === '$!' || n === '$?' || n === '$~' || n === '&') {
          if (t === 0) return e
          t--
        } else (n !== '/$' && n !== '/&') || t++
      }
      e = e.previousSibling
    }
    return null
  }
  function ny(e, t, n) {
    switch (((t = uu(n)), e)) {
      case 'html':
        if (((e = t.documentElement), !e)) throw Error(u(452))
        return e
      case 'head':
        if (((e = t.head), !e)) throw Error(u(453))
        return e
      case 'body':
        if (((e = t.body), !e)) throw Error(u(454))
        return e
      default:
        throw Error(u(451))
    }
  }
  function zi(e) {
    for (var t = e.attributes; t.length; ) e.removeAttributeNode(t[0])
    oc(e)
  }
  var Xt = new Map(),
    ly = new Set()
  function cu(e) {
    return typeof e.getRootNode == 'function' ? e.getRootNode() : e.nodeType === 9 ? e : e.ownerDocument
  }
  var wn = Q.d
  Q.d = { f: h0, r: m0, D: y0, C: p0, L: g0, m: v0, X: S0, S: b0, M: _0 }
  function h0() {
    var e = wn.f(),
      t = Ps()
    return e || t
  }
  function m0(e) {
    var t = Vl(e)
    t !== null && t.tag === 5 && t.type === 'form' ? Sh(t) : wn.r(e)
  }
  var _a = typeof document > 'u' ? null : document
  function ay(e, t, n) {
    var i = _a
    if (i && typeof t == 'string' && t) {
      var r = Ht(t)
      ;((r = 'link[rel="' + e + '"][href="' + r + '"]'),
        typeof n == 'string' && (r += '[crossorigin="' + n + '"]'),
        ly.has(r) ||
          (ly.add(r),
          (e = { rel: e, crossOrigin: n, href: t }),
          i.querySelector(r) === null &&
            ((t = i.createElement('link')), ft(t, 'link', e), at(t), i.head.appendChild(t))))
    }
  }
  function y0(e) {
    ;(wn.D(e), ay('dns-prefetch', e, null))
  }
  function p0(e, t) {
    ;(wn.C(e, t), ay('preconnect', e, t))
  }
  function g0(e, t, n) {
    wn.L(e, t, n)
    var i = _a
    if (i && e && t) {
      var r = 'link[rel="preload"][as="' + Ht(t) + '"]'
      t === 'image' && n && n.imageSrcSet
        ? ((r += '[imagesrcset="' + Ht(n.imageSrcSet) + '"]'),
          typeof n.imageSizes == 'string' && (r += '[imagesizes="' + Ht(n.imageSizes) + '"]'))
        : (r += '[href="' + Ht(e) + '"]')
      var o = r
      switch (t) {
        case 'style':
          o = Ta(e)
          break
        case 'script':
          o = Na(e)
      }
      Xt.has(o) ||
        ((e = S({ rel: 'preload', href: t === 'image' && n && n.imageSrcSet ? void 0 : e, as: t }, n)),
        Xt.set(o, e),
        i.querySelector(r) !== null ||
          (t === 'style' && i.querySelector(Li(o))) ||
          (t === 'script' && i.querySelector(Ri(o))) ||
          ((t = i.createElement('link')), ft(t, 'link', e), at(t), i.head.appendChild(t)))
    }
  }
  function v0(e, t) {
    wn.m(e, t)
    var n = _a
    if (n && e) {
      var i = t && typeof t.as == 'string' ? t.as : 'script',
        r = 'link[rel="modulepreload"][as="' + Ht(i) + '"][href="' + Ht(e) + '"]',
        o = r
      switch (i) {
        case 'audioworklet':
        case 'paintworklet':
        case 'serviceworker':
        case 'sharedworker':
        case 'worker':
        case 'script':
          o = Na(e)
      }
      if (!Xt.has(o) && ((e = S({ rel: 'modulepreload', href: e }, t)), Xt.set(o, e), n.querySelector(r) === null)) {
        switch (i) {
          case 'audioworklet':
          case 'paintworklet':
          case 'serviceworker':
          case 'sharedworker':
          case 'worker':
          case 'script':
            if (n.querySelector(Ri(o))) return
        }
        ;((i = n.createElement('link')), ft(i, 'link', e), at(i), n.head.appendChild(i))
      }
    }
  }
  function b0(e, t, n) {
    wn.S(e, t, n)
    var i = _a
    if (i && e) {
      var r = Kl(i).hoistableStyles,
        o = Ta(e)
      t = t || 'default'
      var h = r.get(o)
      if (!h) {
        var v = { loading: 0, preload: null }
        if ((h = i.querySelector(Li(o)))) v.loading = 5
        else {
          ;((e = S({ 'rel': 'stylesheet', 'href': e, 'data-precedence': t }, n)), (n = Xt.get(o)) && of(e, n))
          var b = (h = i.createElement('link'))
          ;(at(b),
            ft(b, 'link', e),
            (b._p = new Promise(function (w, D) {
              ;((b.onload = w), (b.onerror = D))
            })),
            b.addEventListener('load', function () {
              v.loading |= 1
            }),
            b.addEventListener('error', function () {
              v.loading |= 2
            }),
            (v.loading |= 4),
            ru(h, t, i))
        }
        ;((h = { type: 'stylesheet', instance: h, count: 1, state: v }), r.set(o, h))
      }
    }
  }
  function S0(e, t) {
    wn.X(e, t)
    var n = _a
    if (n && e) {
      var i = Kl(n).hoistableScripts,
        r = Na(e),
        o = i.get(r)
      o ||
        ((o = n.querySelector(Ri(r))),
        o ||
          ((e = S({ src: e, async: !0 }, t)),
          (t = Xt.get(r)) && df(e, t),
          (o = n.createElement('script')),
          at(o),
          ft(o, 'link', e),
          n.head.appendChild(o)),
        (o = { type: 'script', instance: o, count: 1, state: null }),
        i.set(r, o))
    }
  }
  function _0(e, t) {
    wn.M(e, t)
    var n = _a
    if (n && e) {
      var i = Kl(n).hoistableScripts,
        r = Na(e),
        o = i.get(r)
      o ||
        ((o = n.querySelector(Ri(r))),
        o ||
          ((e = S({ src: e, async: !0, type: 'module' }, t)),
          (t = Xt.get(r)) && df(e, t),
          (o = n.createElement('script')),
          at(o),
          ft(o, 'link', e),
          n.head.appendChild(o)),
        (o = { type: 'script', instance: o, count: 1, state: null }),
        i.set(r, o))
    }
  }
  function iy(e, t, n, i) {
    var r = (r = ve.current) ? cu(r) : null
    if (!r) throw Error(u(446))
    switch (e) {
      case 'meta':
      case 'title':
        return null
      case 'style':
        return typeof n.precedence == 'string' && typeof n.href == 'string'
          ? ((t = Ta(n.href)),
            (n = Kl(r).hoistableStyles),
            (i = n.get(t)),
            i || ((i = { type: 'style', instance: null, count: 0, state: null }), n.set(t, i)),
            i)
          : { type: 'void', instance: null, count: 0, state: null }
      case 'link':
        if (n.rel === 'stylesheet' && typeof n.href == 'string' && typeof n.precedence == 'string') {
          e = Ta(n.href)
          var o = Kl(r).hoistableStyles,
            h = o.get(e)
          if (
            (h ||
              ((r = r.ownerDocument || r),
              (h = { type: 'stylesheet', instance: null, count: 0, state: { loading: 0, preload: null } }),
              o.set(e, h),
              (o = r.querySelector(Li(e))) && !o._p && ((h.instance = o), (h.state.loading = 5)),
              Xt.has(e) ||
                ((n = {
                  rel: 'preload',
                  as: 'style',
                  href: n.href,
                  crossOrigin: n.crossOrigin,
                  integrity: n.integrity,
                  media: n.media,
                  hrefLang: n.hrefLang,
                  referrerPolicy: n.referrerPolicy,
                }),
                Xt.set(e, n),
                o || T0(r, e, n, h.state))),
            t && i === null)
          )
            throw Error(u(528, ''))
          return h
        }
        if (t && i !== null) throw Error(u(529, ''))
        return null
      case 'script':
        return (
          (t = n.async),
          (n = n.src),
          typeof n == 'string' && t && typeof t != 'function' && typeof t != 'symbol'
            ? ((t = Na(n)),
              (n = Kl(r).hoistableScripts),
              (i = n.get(t)),
              i || ((i = { type: 'script', instance: null, count: 0, state: null }), n.set(t, i)),
              i)
            : { type: 'void', instance: null, count: 0, state: null }
        )
      default:
        throw Error(u(444, e))
    }
  }
  function Ta(e) {
    return 'href="' + Ht(e) + '"'
  }
  function Li(e) {
    return 'link[rel="stylesheet"][' + e + ']'
  }
  function sy(e) {
    return S({}, e, { 'data-precedence': e.precedence, 'precedence': null })
  }
  function T0(e, t, n, i) {
    e.querySelector('link[rel="preload"][as="style"][' + t + ']')
      ? (i.loading = 1)
      : ((t = e.createElement('link')),
        (i.preload = t),
        t.addEventListener('load', function () {
          return (i.loading |= 1)
        }),
        t.addEventListener('error', function () {
          return (i.loading |= 2)
        }),
        ft(t, 'link', n),
        at(t),
        e.head.appendChild(t))
  }
  function Na(e) {
    return '[src="' + Ht(e) + '"]'
  }
  function Ri(e) {
    return 'script[async]' + e
  }
  function uy(e, t, n) {
    if ((t.count++, t.instance === null))
      switch (t.type) {
        case 'style':
          var i = e.querySelector('style[data-href~="' + Ht(n.href) + '"]')
          if (i) return ((t.instance = i), at(i), i)
          var r = S({}, n, { 'data-href': n.href, 'data-precedence': n.precedence, 'href': null, 'precedence': null })
          return (
            (i = (e.ownerDocument || e).createElement('style')),
            at(i),
            ft(i, 'style', r),
            ru(i, n.precedence, e),
            (t.instance = i)
          )
        case 'stylesheet':
          r = Ta(n.href)
          var o = e.querySelector(Li(r))
          if (o) return ((t.state.loading |= 4), (t.instance = o), at(o), o)
          ;((i = sy(n)), (r = Xt.get(r)) && of(i, r), (o = (e.ownerDocument || e).createElement('link')), at(o))
          var h = o
          return (
            (h._p = new Promise(function (v, b) {
              ;((h.onload = v), (h.onerror = b))
            })),
            ft(o, 'link', i),
            (t.state.loading |= 4),
            ru(o, n.precedence, e),
            (t.instance = o)
          )
        case 'script':
          return (
            (o = Na(n.src)),
            (r = e.querySelector(Ri(o)))
              ? ((t.instance = r), at(r), r)
              : ((i = n),
                (r = Xt.get(o)) && ((i = S({}, n)), df(i, r)),
                (e = e.ownerDocument || e),
                (r = e.createElement('script')),
                at(r),
                ft(r, 'link', i),
                e.head.appendChild(r),
                (t.instance = r))
          )
        case 'void':
          return null
        default:
          throw Error(u(443, t.type))
      }
    else
      t.type === 'stylesheet' &&
        (t.state.loading & 4) === 0 &&
        ((i = t.instance), (t.state.loading |= 4), ru(i, n.precedence, e))
    return t.instance
  }
  function ru(e, t, n) {
    for (
      var i = n.querySelectorAll('link[rel="stylesheet"][data-precedence],style[data-precedence]'),
        r = i.length ? i[i.length - 1] : null,
        o = r,
        h = 0;
      h < i.length;
      h++
    ) {
      var v = i[h]
      if (v.dataset.precedence === t) o = v
      else if (o !== r) break
    }
    o
      ? o.parentNode.insertBefore(e, o.nextSibling)
      : ((t = n.nodeType === 9 ? n.head : n), t.insertBefore(e, t.firstChild))
  }
  function of(e, t) {
    ;(e.crossOrigin == null && (e.crossOrigin = t.crossOrigin),
      e.referrerPolicy == null && (e.referrerPolicy = t.referrerPolicy),
      e.title == null && (e.title = t.title))
  }
  function df(e, t) {
    ;(e.crossOrigin == null && (e.crossOrigin = t.crossOrigin),
      e.referrerPolicy == null && (e.referrerPolicy = t.referrerPolicy),
      e.integrity == null && (e.integrity = t.integrity))
  }
  var fu = null
  function cy(e, t, n) {
    if (fu === null) {
      var i = new Map(),
        r = (fu = new Map())
      r.set(n, i)
    } else ((r = fu), (i = r.get(n)), i || ((i = new Map()), r.set(n, i)))
    if (i.has(e)) return i
    for (i.set(e, null), n = n.getElementsByTagName(e), r = 0; r < n.length; r++) {
      var o = n[r]
      if (
        !(o[Fa] || o[st] || (e === 'link' && o.getAttribute('rel') === 'stylesheet')) &&
        o.namespaceURI !== 'http://www.w3.org/2000/svg'
      ) {
        var h = o.getAttribute(t) || ''
        h = e + h
        var v = i.get(h)
        v ? v.push(o) : i.set(h, [o])
      }
    }
    return i
  }
  function ry(e, t, n) {
    ;((e = e.ownerDocument || e), e.head.insertBefore(n, t === 'title' ? e.querySelector('head > title') : null))
  }
  function N0(e, t, n) {
    if (n === 1 || t.itemProp != null) return !1
    switch (e) {
      case 'meta':
      case 'title':
        return !0
      case 'style':
        if (typeof t.precedence != 'string' || typeof t.href != 'string' || t.href === '') break
        return !0
      case 'link':
        if (typeof t.rel != 'string' || typeof t.href != 'string' || t.href === '' || t.onLoad || t.onError) break
        switch (t.rel) {
          case 'stylesheet':
            return ((e = t.disabled), typeof t.precedence == 'string' && e == null)
          default:
            return !0
        }
      case 'script':
        if (
          t.async &&
          typeof t.async != 'function' &&
          typeof t.async != 'symbol' &&
          !t.onLoad &&
          !t.onError &&
          t.src &&
          typeof t.src == 'string'
        )
          return !0
    }
    return !1
  }
  function fy(e) {
    return !(e.type === 'stylesheet' && (e.state.loading & 3) === 0)
  }
  function x0(e, t, n, i) {
    if (
      n.type === 'stylesheet' &&
      (typeof i.media != 'string' || matchMedia(i.media).matches !== !1) &&
      (n.state.loading & 4) === 0
    ) {
      if (n.instance === null) {
        var r = Ta(i.href),
          o = t.querySelector(Li(r))
        if (o) {
          ;((t = o._p),
            t !== null &&
              typeof t == 'object' &&
              typeof t.then == 'function' &&
              (e.count++, (e = ou.bind(e)), t.then(e, e)),
            (n.state.loading |= 4),
            (n.instance = o),
            at(o))
          return
        }
        ;((o = t.ownerDocument || t), (i = sy(i)), (r = Xt.get(r)) && of(i, r), (o = o.createElement('link')), at(o))
        var h = o
        ;((h._p = new Promise(function (v, b) {
          ;((h.onload = v), (h.onerror = b))
        })),
          ft(o, 'link', i),
          (n.instance = o))
      }
      ;(e.stylesheets === null && (e.stylesheets = new Map()),
        e.stylesheets.set(n, t),
        (t = n.state.preload) &&
          (n.state.loading & 3) === 0 &&
          (e.count++, (n = ou.bind(e)), t.addEventListener('load', n), t.addEventListener('error', n)))
    }
  }
  var hf = 0
  function E0(e, t) {
    return (
      e.stylesheets && e.count === 0 && hu(e, e.stylesheets),
      0 < e.count || 0 < e.imgCount
        ? function (n) {
            var i = setTimeout(function () {
              if ((e.stylesheets && hu(e, e.stylesheets), e.unsuspend)) {
                var o = e.unsuspend
                ;((e.unsuspend = null), o())
              }
            }, 6e4 + t)
            0 < e.imgBytes && hf === 0 && (hf = 62500 * i0())
            var r = setTimeout(
              function () {
                if (
                  ((e.waitingForImages = !1), e.count === 0 && (e.stylesheets && hu(e, e.stylesheets), e.unsuspend))
                ) {
                  var o = e.unsuspend
                  ;((e.unsuspend = null), o())
                }
              },
              (e.imgBytes > hf ? 50 : 800) + t
            )
            return (
              (e.unsuspend = n),
              function () {
                ;((e.unsuspend = null), clearTimeout(i), clearTimeout(r))
              }
            )
          }
        : null
    )
  }
  function ou() {
    if ((this.count--, this.count === 0 && (this.imgCount === 0 || !this.waitingForImages))) {
      if (this.stylesheets) hu(this, this.stylesheets)
      else if (this.unsuspend) {
        var e = this.unsuspend
        ;((this.unsuspend = null), e())
      }
    }
  }
  var du = null
  function hu(e, t) {
    ;((e.stylesheets = null),
      e.unsuspend !== null && (e.count++, (du = new Map()), t.forEach(A0, e), (du = null), ou.call(e)))
  }
  function A0(e, t) {
    if (!(t.state.loading & 4)) {
      var n = du.get(e)
      if (n) var i = n.get(null)
      else {
        ;((n = new Map()), du.set(e, n))
        for (var r = e.querySelectorAll('link[data-precedence],style[data-precedence]'), o = 0; o < r.length; o++) {
          var h = r[o]
          ;(h.nodeName === 'LINK' || h.getAttribute('media') !== 'not all') && (n.set(h.dataset.precedence, h), (i = h))
        }
        i && n.set(null, i)
      }
      ;((r = t.instance),
        (h = r.getAttribute('data-precedence')),
        (o = n.get(h) || i),
        o === i && n.set(null, r),
        n.set(h, r),
        this.count++,
        (i = ou.bind(this)),
        r.addEventListener('load', i),
        r.addEventListener('error', i),
        o
          ? o.parentNode.insertBefore(r, o.nextSibling)
          : ((e = e.nodeType === 9 ? e.head : e), e.insertBefore(r, e.firstChild)),
        (t.state.loading |= 4))
    }
  }
  var Ui = { $$typeof: I, Provider: null, Consumer: null, _currentValue: H, _currentValue2: H, _threadCount: 0 }
  function O0(e, t, n, i, r, o, h, v, b) {
    ;((this.tag = 1),
      (this.containerInfo = e),
      (this.pingCache = this.current = this.pendingChildren = null),
      (this.timeoutHandle = -1),
      (this.callbackNode = this.next = this.pendingContext = this.context = this.cancelPendingCommit = null),
      (this.callbackPriority = 0),
      (this.expirationTimes = uc(-1)),
      (this.entangledLanes =
        this.shellSuspendCounter =
        this.errorRecoveryDisabledLanes =
        this.expiredLanes =
        this.warmLanes =
        this.pingedLanes =
        this.suspendedLanes =
        this.pendingLanes =
          0),
      (this.entanglements = uc(0)),
      (this.hiddenUpdates = uc(null)),
      (this.identifierPrefix = i),
      (this.onUncaughtError = r),
      (this.onCaughtError = o),
      (this.onRecoverableError = h),
      (this.pooledCache = null),
      (this.pooledCacheLanes = 0),
      (this.formState = b),
      (this.incompleteTransitions = new Map()))
  }
  function oy(e, t, n, i, r, o, h, v, b, w, D, q) {
    return (
      (e = new O0(e, t, n, h, b, w, D, q, v)),
      (t = 1),
      o === !0 && (t |= 24),
      (o = Mt(3, null, null, t)),
      (e.current = o),
      (o.stateNode = e),
      (t = Gc()),
      t.refCount++,
      (e.pooledCache = t),
      t.refCount++,
      (o.memoizedState = { element: i, isDehydrated: n, cache: t }),
      Jc(o),
      e
    )
  }
  function dy(e) {
    return e ? ((e = ea), e) : ea
  }
  function hy(e, t, n, i, r, o) {
    ;((r = dy(r)),
      i.context === null ? (i.context = r) : (i.pendingContext = r),
      (i = Zn(t)),
      (i.payload = { element: n }),
      (o = o === void 0 ? null : o),
      o !== null && (i.callback = o),
      (n = Vn(e, i, t)),
      n !== null && (xt(n, e, t), yi(n, e, t)))
  }
  function my(e, t) {
    if (((e = e.memoizedState), e !== null && e.dehydrated !== null)) {
      var n = e.retryLane
      e.retryLane = n !== 0 && n < t ? n : t
    }
  }
  function mf(e, t) {
    ;(my(e, t), (e = e.alternate) && my(e, t))
  }
  function yy(e) {
    if (e.tag === 13 || e.tag === 31) {
      var t = bl(e, 67108864)
      ;(t !== null && xt(t, e, 67108864), mf(e, 67108864))
    }
  }
  function py(e) {
    if (e.tag === 13 || e.tag === 31) {
      var t = Ut()
      t = cc(t)
      var n = bl(e, t)
      ;(n !== null && xt(n, e, t), mf(e, t))
    }
  }
  var mu = !0
  function j0(e, t, n, i) {
    var r = z.T
    z.T = null
    var o = Q.p
    try {
      ;((Q.p = 2), yf(e, t, n, i))
    } finally {
      ;((Q.p = o), (z.T = r))
    }
  }
  function w0(e, t, n, i) {
    var r = z.T
    z.T = null
    var o = Q.p
    try {
      ;((Q.p = 8), yf(e, t, n, i))
    } finally {
      ;((Q.p = o), (z.T = r))
    }
  }
  function yf(e, t, n, i) {
    if (mu) {
      var r = pf(i)
      if (r === null) (ef(e, t, i, yu, n), vy(e, i))
      else if (C0(r, e, t, n, i)) i.stopPropagation()
      else if ((vy(e, i), t & 4 && -1 < k0.indexOf(e))) {
        for (; r !== null; ) {
          var o = Vl(r)
          if (o !== null)
            switch (o.tag) {
              case 3:
                if (((o = o.stateNode), o.current.memoizedState.isDehydrated)) {
                  var h = ml(o.pendingLanes)
                  if (h !== 0) {
                    var v = o
                    for (v.pendingLanes |= 2, v.entangledLanes |= 2; h; ) {
                      var b = 1 << (31 - kt(h))
                      ;((v.entanglements[1] |= b), (h &= ~b))
                    }
                    ;(un(o), (je & 6) === 0 && ((Ws = jt() + 500), Ci(0)))
                  }
                }
                break
              case 31:
              case 13:
                ;((v = bl(o, 2)), v !== null && xt(v, o, 2), Ps(), mf(o, 2))
            }
          if (((o = pf(i)), o === null && ef(e, t, i, yu, n), o === r)) break
          r = o
        }
        r !== null && i.stopPropagation()
      } else ef(e, t, i, null, n)
    }
  }
  function pf(e) {
    return ((e = gc(e)), gf(e))
  }
  var yu = null
  function gf(e) {
    if (((yu = null), (e = Zl(e)), e !== null)) {
      var t = f(e)
      if (t === null) e = null
      else {
        var n = t.tag
        if (n === 13) {
          if (((e = d(t)), e !== null)) return e
          e = null
        } else if (n === 31) {
          if (((e = m(t)), e !== null)) return e
          e = null
        } else if (n === 3) {
          if (t.stateNode.current.memoizedState.isDehydrated) return t.tag === 3 ? t.stateNode.containerInfo : null
          e = null
        } else t !== e && (e = null)
      }
    }
    return ((yu = e), null)
  }
  function gy(e) {
    switch (e) {
      case 'beforetoggle':
      case 'cancel':
      case 'click':
      case 'close':
      case 'contextmenu':
      case 'copy':
      case 'cut':
      case 'auxclick':
      case 'dblclick':
      case 'dragend':
      case 'dragstart':
      case 'drop':
      case 'focusin':
      case 'focusout':
      case 'input':
      case 'invalid':
      case 'keydown':
      case 'keypress':
      case 'keyup':
      case 'mousedown':
      case 'mouseup':
      case 'paste':
      case 'pause':
      case 'play':
      case 'pointercancel':
      case 'pointerdown':
      case 'pointerup':
      case 'ratechange':
      case 'reset':
      case 'resize':
      case 'seeked':
      case 'submit':
      case 'toggle':
      case 'touchcancel':
      case 'touchend':
      case 'touchstart':
      case 'volumechange':
      case 'change':
      case 'selectionchange':
      case 'textInput':
      case 'compositionstart':
      case 'compositionend':
      case 'compositionupdate':
      case 'beforeblur':
      case 'afterblur':
      case 'beforeinput':
      case 'blur':
      case 'fullscreenchange':
      case 'focus':
      case 'hashchange':
      case 'popstate':
      case 'select':
      case 'selectstart':
        return 2
      case 'drag':
      case 'dragenter':
      case 'dragexit':
      case 'dragleave':
      case 'dragover':
      case 'mousemove':
      case 'mouseout':
      case 'mouseover':
      case 'pointermove':
      case 'pointerout':
      case 'pointerover':
      case 'scroll':
      case 'touchmove':
      case 'wheel':
      case 'mouseenter':
      case 'mouseleave':
      case 'pointerenter':
      case 'pointerleave':
        return 8
      case 'message':
        switch (yg()) {
          case Eo:
            return 2
          case Ao:
            return 8
          case as:
          case pg:
            return 32
          case Oo:
            return 268435456
          default:
            return 32
        }
      default:
        return 32
    }
  }
  var vf = !1,
    el = null,
    tl = null,
    nl = null,
    Bi = new Map(),
    qi = new Map(),
    ll = [],
    k0 =
      'mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset'.split(
        ' '
      )
  function vy(e, t) {
    switch (e) {
      case 'focusin':
      case 'focusout':
        el = null
        break
      case 'dragenter':
      case 'dragleave':
        tl = null
        break
      case 'mouseover':
      case 'mouseout':
        nl = null
        break
      case 'pointerover':
      case 'pointerout':
        Bi.delete(t.pointerId)
        break
      case 'gotpointercapture':
      case 'lostpointercapture':
        qi.delete(t.pointerId)
    }
  }
  function Hi(e, t, n, i, r, o) {
    return e === null || e.nativeEvent !== o
      ? ((e = { blockedOn: t, domEventName: n, eventSystemFlags: i, nativeEvent: o, targetContainers: [r] }),
        t !== null && ((t = Vl(t)), t !== null && yy(t)),
        e)
      : ((e.eventSystemFlags |= i), (t = e.targetContainers), r !== null && t.indexOf(r) === -1 && t.push(r), e)
  }
  function C0(e, t, n, i, r) {
    switch (t) {
      case 'focusin':
        return ((el = Hi(el, e, t, n, i, r)), !0)
      case 'dragenter':
        return ((tl = Hi(tl, e, t, n, i, r)), !0)
      case 'mouseover':
        return ((nl = Hi(nl, e, t, n, i, r)), !0)
      case 'pointerover':
        var o = r.pointerId
        return (Bi.set(o, Hi(Bi.get(o) || null, e, t, n, i, r)), !0)
      case 'gotpointercapture':
        return ((o = r.pointerId), qi.set(o, Hi(qi.get(o) || null, e, t, n, i, r)), !0)
    }
    return !1
  }
  function by(e) {
    var t = Zl(e.target)
    if (t !== null) {
      var n = f(t)
      if (n !== null) {
        if (((t = n.tag), t === 13)) {
          if (((t = d(n)), t !== null)) {
            ;((e.blockedOn = t),
              Do(e.priority, function () {
                py(n)
              }))
            return
          }
        } else if (t === 31) {
          if (((t = m(n)), t !== null)) {
            ;((e.blockedOn = t),
              Do(e.priority, function () {
                py(n)
              }))
            return
          }
        } else if (t === 3 && n.stateNode.current.memoizedState.isDehydrated) {
          e.blockedOn = n.tag === 3 ? n.stateNode.containerInfo : null
          return
        }
      }
    }
    e.blockedOn = null
  }
  function pu(e) {
    if (e.blockedOn !== null) return !1
    for (var t = e.targetContainers; 0 < t.length; ) {
      var n = pf(e.nativeEvent)
      if (n === null) {
        n = e.nativeEvent
        var i = new n.constructor(n.type, n)
        ;((pc = i), n.target.dispatchEvent(i), (pc = null))
      } else return ((t = Vl(n)), t !== null && yy(t), (e.blockedOn = n), !1)
      t.shift()
    }
    return !0
  }
  function Sy(e, t, n) {
    pu(e) && n.delete(t)
  }
  function M0() {
    ;((vf = !1),
      el !== null && pu(el) && (el = null),
      tl !== null && pu(tl) && (tl = null),
      nl !== null && pu(nl) && (nl = null),
      Bi.forEach(Sy),
      qi.forEach(Sy))
  }
  function gu(e, t) {
    e.blockedOn === t &&
      ((e.blockedOn = null), vf || ((vf = !0), s.unstable_scheduleCallback(s.unstable_NormalPriority, M0)))
  }
  var vu = null
  function _y(e) {
    vu !== e &&
      ((vu = e),
      s.unstable_scheduleCallback(s.unstable_NormalPriority, function () {
        vu === e && (vu = null)
        for (var t = 0; t < e.length; t += 3) {
          var n = e[t],
            i = e[t + 1],
            r = e[t + 2]
          if (typeof i != 'function') {
            if (gf(i || n) === null) continue
            break
          }
          var o = Vl(n)
          o !== null && (e.splice(t, 3), (t -= 3), yr(o, { pending: !0, data: r, method: n.method, action: i }, i, r))
        }
      }))
  }
  function xa(e) {
    function t(b) {
      return gu(b, e)
    }
    ;(el !== null && gu(el, e), tl !== null && gu(tl, e), nl !== null && gu(nl, e), Bi.forEach(t), qi.forEach(t))
    for (var n = 0; n < ll.length; n++) {
      var i = ll[n]
      i.blockedOn === e && (i.blockedOn = null)
    }
    for (; 0 < ll.length && ((n = ll[0]), n.blockedOn === null); ) (by(n), n.blockedOn === null && ll.shift())
    if (((n = (e.ownerDocument || e).$$reactFormReplay), n != null))
      for (i = 0; i < n.length; i += 3) {
        var r = n[i],
          o = n[i + 1],
          h = r[vt] || null
        if (typeof o == 'function') h || _y(n)
        else if (h) {
          var v = null
          if (o && o.hasAttribute('formAction')) {
            if (((r = o), (h = o[vt] || null))) v = h.formAction
            else if (gf(r) !== null) continue
          } else v = h.action
          ;(typeof v == 'function' ? (n[i + 1] = v) : (n.splice(i, 3), (i -= 3)), _y(n))
        }
      }
  }
  function Ty() {
    function e(o) {
      o.canIntercept &&
        o.info === 'react-transition' &&
        o.intercept({
          handler: function () {
            return new Promise(function (h) {
              return (r = h)
            })
          },
          focusReset: 'manual',
          scroll: 'manual',
        })
    }
    function t() {
      ;(r !== null && (r(), (r = null)), i || setTimeout(n, 20))
    }
    function n() {
      if (!i && !navigation.transition) {
        var o = navigation.currentEntry
        o &&
          o.url != null &&
          navigation.navigate(o.url, { state: o.getState(), info: 'react-transition', history: 'replace' })
      }
    }
    if (typeof navigation == 'object') {
      var i = !1,
        r = null
      return (
        navigation.addEventListener('navigate', e),
        navigation.addEventListener('navigatesuccess', t),
        navigation.addEventListener('navigateerror', t),
        setTimeout(n, 100),
        function () {
          ;((i = !0),
            navigation.removeEventListener('navigate', e),
            navigation.removeEventListener('navigatesuccess', t),
            navigation.removeEventListener('navigateerror', t),
            r !== null && (r(), (r = null)))
        }
      )
    }
  }
  function bf(e) {
    this._internalRoot = e
  }
  ;((bu.prototype.render = bf.prototype.render =
    function (e) {
      var t = this._internalRoot
      if (t === null) throw Error(u(409))
      var n = t.current,
        i = Ut()
      hy(n, i, e, t, null, null)
    }),
    (bu.prototype.unmount = bf.prototype.unmount =
      function () {
        var e = this._internalRoot
        if (e !== null) {
          this._internalRoot = null
          var t = e.containerInfo
          ;(hy(e.current, 2, null, e, null, null), Ps(), (t[Yl] = null))
        }
      }))
  function bu(e) {
    this._internalRoot = e
  }
  bu.prototype.unstable_scheduleHydration = function (e) {
    if (e) {
      var t = Mo()
      e = { blockedOn: null, target: e, priority: t }
      for (var n = 0; n < ll.length && t !== 0 && t < ll[n].priority; n++);
      ;(ll.splice(n, 0, e), n === 0 && by(e))
    }
  }
  var Ny = l.version
  if (Ny !== '19.2.3') throw Error(u(527, Ny, '19.2.3'))
  Q.findDOMNode = function (e) {
    var t = e._reactInternals
    if (t === void 0)
      throw typeof e.render == 'function' ? Error(u(188)) : ((e = Object.keys(e).join(',')), Error(u(268, e)))
    return ((e = p(t)), (e = e !== null ? _(e) : null), (e = e === null ? null : e.stateNode), e)
  }
  var D0 = {
    bundleType: 0,
    version: '19.2.3',
    rendererPackageName: 'react-dom',
    currentDispatcherRef: z,
    reconcilerVersion: '19.2.3',
  }
  if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < 'u') {
    var Su = __REACT_DEVTOOLS_GLOBAL_HOOK__
    if (!Su.isDisabled && Su.supportsFiber)
      try {
        ;((Ja = Su.inject(D0)), (wt = Su))
      } catch {}
  }
  return (
    (Zi.createRoot = function (e, t) {
      if (!c(e)) throw Error(u(299))
      var n = !1,
        i = '',
        r = kh,
        o = Ch,
        h = Mh
      return (
        t != null &&
          (t.unstable_strictMode === !0 && (n = !0),
          t.identifierPrefix !== void 0 && (i = t.identifierPrefix),
          t.onUncaughtError !== void 0 && (r = t.onUncaughtError),
          t.onCaughtError !== void 0 && (o = t.onCaughtError),
          t.onRecoverableError !== void 0 && (h = t.onRecoverableError)),
        (t = oy(e, 1, !1, null, null, n, i, null, r, o, h, Ty)),
        (e[Yl] = t.current),
        Pr(e),
        new bf(t)
      )
    }),
    (Zi.hydrateRoot = function (e, t, n) {
      if (!c(e)) throw Error(u(299))
      var i = !1,
        r = '',
        o = kh,
        h = Ch,
        v = Mh,
        b = null
      return (
        n != null &&
          (n.unstable_strictMode === !0 && (i = !0),
          n.identifierPrefix !== void 0 && (r = n.identifierPrefix),
          n.onUncaughtError !== void 0 && (o = n.onUncaughtError),
          n.onCaughtError !== void 0 && (h = n.onCaughtError),
          n.onRecoverableError !== void 0 && (v = n.onRecoverableError),
          n.formState !== void 0 && (b = n.formState)),
        (t = oy(e, 1, !0, t, n ?? null, i, r, b, o, h, v, Ty)),
        (t.context = dy(null)),
        (n = t.current),
        (i = Ut()),
        (i = cc(i)),
        (r = Zn(i)),
        (r.callback = null),
        Vn(n, r, i),
        (n = i),
        (t.current.lanes = n),
        Wa(t, n),
        un(t),
        (e[Yl] = t.current),
        Pr(e),
        new bu(t)
      )
    }),
    (Zi.version = '19.2.3'),
    Zi
  )
}
var Dy
function V0() {
  if (Dy) return Tf.exports
  Dy = 1
  function s() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > 'u' || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != 'function'))
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(s)
      } catch (l) {
        console.error(l)
      }
  }
  return (s(), (Tf.exports = Z0()), Tf.exports)
}
var K0 = V0()
function eo() {
  const s = '/__ADMIN_BASE__/'
  if (!s.includes('__ADMIN_BASE__')) return s
  const l = window.location.pathname.split('/').filter(Boolean)
  return l.length > 0 ? `/${l[0]}/` : '/'
}
function G0() {
  return `${eo().replace(/\/$/, '')}/api`
}
function fp() {
  return eo().replace(/\/$/, '')
}
async function Qe(s, l) {
  const a = await fetch(`${G0()}${s}`, {
    headers: { 'Content-Type': 'application/json', ...(l == null ? void 0 : l.headers) },
    credentials: 'include',
    ...l,
  })
  if (a.status === 401) throw ((window.location.href = `${fp()}/login`), new Error('Unauthorized'))
  if (!a.ok) {
    let u = `Request failed: ${a.status}`
    try {
      const c = await a.json()
      c.error && (u = c.error)
    } catch {}
    throw new Error(u)
  }
  return a.json()
}
function $0(s) {
  const l = s ? `?search=${encodeURIComponent(s)}` : ''
  return Qe(`/users${l}`)
}
function Q0(s) {
  return Qe(`/users/${s}`)
}
function X0(s, l) {
  return Qe(`/users/${s}/config`, { method: 'PATCH', body: JSON.stringify(l) })
}
function J0(s) {
  return Qe(`/impersonate/${s}`, { method: 'POST' })
}
function I0(s, l, a) {
  return Qe('/dev/create-user', { method: 'POST', body: JSON.stringify({ email: s, name: l, config: a }) })
}
function W0() {
  return `${fp()}/logout`
}
function F0() {
  return Qe('/llm-defaults')
}
function P0(s) {
  return Qe('/llm-defaults', { method: 'PATCH', body: JSON.stringify(s) })
}
function eb() {
  return Qe('/skills')
}
function tb(s) {
  return Qe('/skills', { method: 'POST', body: JSON.stringify(s) })
}
function nb(s, l) {
  return Qe(`/skills/${s}`, { method: 'PATCH', body: JSON.stringify(l) })
}
function lb(s) {
  return Qe(`/skills/${s}`, { method: 'DELETE' })
}
function ab() {
  return Qe('/dashboard/overview')
}
function ib() {
  return Qe('/embed-templates')
}
function sb(s) {
  return Qe('/embed-templates', { method: 'POST', body: JSON.stringify({ workspaceId: s }) })
}
function ub(s) {
  return Qe(`/embed-templates/${s}`, { method: 'DELETE' })
}
function cb() {
  return Qe('/dashboard/usage')
}
function rb() {
  return Qe('/dashboard/cost')
}
function fb(s) {
  const l = s ? `?search=${encodeURIComponent(s)}` : ''
  return Qe(`/workspaces${l}`)
}
function ob(s) {
  return Qe(`/workspaces/${s}/template-export`)
}
function db() {
  return Qe('/workspace-templates/default')
}
function hb(s) {
  return Qe('/workspace-templates/default', { method: 'POST', body: JSON.stringify(s) })
}
function mb() {
  return Qe('/workspace-templates/default', { method: 'DELETE' })
}
const to = 'openai',
  yb = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
  pb = ['default', 'priority'],
  Af = { small: 'gpt-5.5', medium: 'gpt-5.5', big: 'gpt-5.5' },
  Of = { medium: 'claude-sonnet-4-6', big: 'claude-opus-4-6' },
  gb = [
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'openai', label: 'OpenAI' },
  ],
  vb = {
    anthropic: {
      label: 'Anthropic',
      adminLabel: 'Anthropic',
      supportsReasoningEffortOverride: !1,
      reasoningEffortOptions: [],
      defaults: {
        main: { modelId: Of.big, thinkingMode: 'adaptive' },
        explore: { modelId: Of.medium, thinkingMode: 'adaptive' },
        external: { modelId: Of.medium, thinkingMode: 'adaptive' },
      },
    },
    openai: {
      label: 'OpenAI',
      adminLabel: 'OpenAI',
      supportsReasoningEffortOverride: !0,
      reasoningEffortOptions: yb,
      defaults: {
        main: { modelId: Af.big, reasoningEffort: 'high' },
        explore: { modelId: Af.small, reasoningEffort: 'high' },
        external: { modelId: Af.medium, reasoningEffort: 'medium' },
      },
    },
  }
function bb(s) {
  return s ?? to
}
function Hu(s) {
  return vb[bb(s)]
}
function Sb(s) {
  return s === 'anthropic' || s === 'openai' ? s : void 0
}
function _b(s) {
  return Hu(s).reasoningEffortOptions
}
function Tb(s) {
  const l = Hu(s),
    a = [
      `main agent ${jf(l.defaults.main)}`,
      `external subagent ${jf(l.defaults.external)}`,
      `explorer subagent ${jf(l.defaults.explore)}`,
    ].join(', ')
  return s
    ? s === 'openai'
      ? `Leave model and reasoning blank to use ${l.adminLabel} defaults: ${a}. Overrides apply everywhere.`
      : `Leave model blank to use ${l.adminLabel} defaults: ${a}. Anthropic uses adaptive thinking automatically on Sonnet/Opus 4.6, so no reasoning override is needed.`
    : `Leave provider blank to use the system default provider (${l.adminLabel}). Leave model blank to use its defaults: ${a}. Reasoning overrides are only available for OpenAI.`
}
function jf(s) {
  return s.reasoningEffort
    ? `${s.modelId} with ${s.reasoningEffort} reasoning`
    : s.thinkingMode === 'adaptive'
      ? `${s.modelId} with adaptive thinking`
      : s.modelId
}
function no() {
  return gb
}
function lo(s) {
  return Tb(Bl(s))
}
function ao(s) {
  return Bl(s) ? 'Provider default' : 'System default'
}
function ja(s) {
  return Hu(Bl(s)).supportsReasoningEffortOverride
}
function op(s) {
  return _b(Bl(s))
}
function zy(s) {
  return (Bl(s) ?? to) === 'openai'
}
function Nb() {
  return pb
}
function Ly(s) {
  const l = [],
    a = s.llmProvider ? Bl(String(s.llmProvider)) : void 0,
    u = a ?? to
  return (
    s.llmProvider && l.push(a ? Hu(a).adminLabel : String(s.llmProvider)),
    s.llmModel && l.push(String(s.llmModel)),
    s.reasoningEffort && a === 'openai' && l.push(`${String(s.reasoningEffort)} reasoning`),
    s.llmServiceTier && u === 'openai' && l.push(`${String(s.llmServiceTier)} service tier`),
    l.length > 0 ? l.join(' / ') : null
  )
}
function Bl(s) {
  return Sb(s)
}
function xb({ onSelectUser: s }) {
  const [l, a] = W.useState([]),
    [u, c] = W.useState(''),
    [f, d] = W.useState(!0),
    m = W.useRef(void 0)
  return (
    W.useEffect(() => {
      ;(d(!0),
        clearTimeout(m.current),
        (m.current = setTimeout(
          () => {
            $0(u || void 0)
              .then(a)
              .catch(console.error)
              .finally(() => d(!1))
          },
          u ? 300 : 0
        )))
    }, [u]),
    y.jsxs(y.Fragment, {
      children: [
        y.jsx('div', {
          className: 'search-bar',
          children: y.jsx('input', {
            type: 'text',
            placeholder: 'Search by email or name...',
            value: u,
            onChange: (g) => c(g.target.value),
            autoFocus: !0,
          }),
        }),
        f
          ? y.jsx('div', { className: 'loading', children: 'Loading...' })
          : y.jsxs('table', {
              children: [
                y.jsx('thead', {
                  children: y.jsxs('tr', {
                    children: [
                      y.jsx('th', { children: 'Name' }),
                      y.jsx('th', { children: 'Email' }),
                      y.jsx('th', { children: 'Organization' }),
                      y.jsx('th', { children: 'Role' }),
                      y.jsx('th', { children: 'Override' }),
                      y.jsx('th', { children: 'Joined' }),
                    ],
                  }),
                }),
                y.jsxs('tbody', {
                  children: [
                    l.map((g) => {
                      var p
                      return y.jsxs(
                        'tr',
                        {
                          onClick: () => s(g.id),
                          children: [
                            y.jsx('td', { children: g.name }),
                            y.jsx('td', { children: g.email }),
                            y.jsx('td', {
                              children:
                                ((p = g.organization) == null ? void 0 : p.name) ??
                                y.jsx('span', { className: 'text-muted', children: '—' }),
                            }),
                            y.jsx('td', {
                              children: g.orgRole
                                ? y.jsx('span', {
                                    className: `badge ${g.orgRole === 'admin' ? 'badge-blue' : 'badge-gray'}`,
                                    children: g.orgRole,
                                  })
                                : y.jsx('span', { className: 'text-muted', children: '—' }),
                            }),
                            y.jsx('td', {
                              children: Ly(g.config)
                                ? y.jsx('span', { className: 'badge badge-yellow', children: Ly(g.config) })
                                : y.jsx('span', { className: 'text-muted', children: 'default' }),
                            }),
                            y.jsx('td', {
                              className: 'text-muted',
                              children: new Date(g.createdAt).toLocaleDateString(),
                            }),
                          ],
                        },
                        g.id
                      )
                    }),
                    l.length === 0 &&
                      y.jsx('tr', {
                        children: y.jsx('td', {
                          colSpan: 6,
                          className: 'text-muted',
                          style: { textAlign: 'center', padding: 40 },
                          children: u ? 'No users found' : 'No users yet',
                        }),
                      }),
                  ],
                }),
              ],
            }),
      ],
    })
  )
}
const Eb = {
  complete: 'badge-green',
  processing: 'badge-yellow',
  waiting: 'badge-blue',
  error: 'badge-red',
  initiated: 'badge-gray',
}
function Ab({ userId: s, onBack: l }) {
  const [a, u] = W.useState(null),
    [c, f] = W.useState(!0),
    [d, m] = W.useState(!1),
    [g, p] = W.useState(null),
    [_, S] = W.useState(''),
    [O, E] = W.useState(''),
    [U, A] = W.useState(''),
    M = ao(_),
    K = ja(_),
    Z = (L) => {
      ;(S(L), E(''), ja(L) || A(''))
    }
  W.useEffect(() => {
    ;(f(!0),
      p(null),
      Q0(s)
        .then((L) => {
          u(L)
          const $ = L.config.llmProvider || ''
          ;(S($), E(L.config.llmModel || ''), A((ja($) && L.config.reasoningEffort) || ''))
        })
        .catch(console.error)
        .finally(() => f(!1)))
  }, [s])
  const I = async () => {
      m(!0)
      try {
        const $ = await X0(s, { llmProvider: _ || null, llmModel: O || null, reasoningEffort: (K && U) || null }),
          X = $.config.llmProvider || ''
        ;(S(X),
          E($.config.llmModel || ''),
          A((ja(X) && $.config.reasoningEffort) || ''),
          u((G) => G && { ...G, config: $.config }))
      } catch (L) {
        console.error(L)
      } finally {
        m(!1)
      }
    },
    Y = async () => {
      try {
        const L = await J0(s)
        p(L)
      } catch (L) {
        console.error(L)
      }
    }
  return c
    ? y.jsx('div', { className: 'loading', children: 'Loading...' })
    : a
      ? y.jsxs('div', {
          className: 'user-detail',
          children: [
            y.jsx('a', { className: 'back', onClick: l, children: '← Back to users' }),
            y.jsxs('div', {
              className: 'user-header',
              children: [
                y.jsx('h2', { children: a.name }),
                y.jsx('div', { className: 'email', children: a.email }),
                y.jsxs('div', {
                  className: 'user-meta',
                  children: [
                    a.organization && y.jsx('span', { children: a.organization.name }),
                    a.orgRole &&
                      y.jsx('span', {
                        className: `badge ${a.orgRole === 'admin' ? 'badge-blue' : 'badge-gray'}`,
                        children: a.orgRole,
                      }),
                    y.jsxs('span', { children: ['Joined ', new Date(a.createdAt).toLocaleDateString()] }),
                  ],
                }),
              ],
            }),
            y.jsxs('div', {
              className: 'section',
              children: [
                y.jsx('h3', { children: 'Config Overrides' }),
                y.jsxs('div', {
                  className: 'config-grid',
                  children: [
                    y.jsx('label', { children: 'Provider' }),
                    y.jsxs('select', {
                      value: _,
                      onChange: (L) => Z(L.target.value),
                      children: [
                        y.jsx('option', { value: '', children: 'System default' }),
                        no().map((L) => y.jsx('option', { value: L.value, children: L.label }, L.value)),
                      ],
                    }),
                    y.jsx('label', { children: 'Model' }),
                    y.jsx('input', { type: 'text', value: O, onChange: (L) => E(L.target.value), placeholder: M }),
                    y.jsx('label', { children: 'Reasoning' }),
                    K
                      ? y.jsxs('select', {
                          value: U,
                          onChange: (L) => A(L.target.value),
                          children: [
                            y.jsx('option', { value: '', children: M }),
                            op(_).map((L) => y.jsx('option', { value: L, children: L }, L)),
                          ],
                        })
                      : y.jsx('div', {
                          className: 'text-muted',
                          style: { fontSize: 13, paddingTop: 8 },
                          children: 'Automatic (adaptive on Sonnet/Opus 4.6)',
                        }),
                  ],
                }),
                y.jsx('p', {
                  className: 'text-muted',
                  style: { marginTop: 10, fontSize: 12, lineHeight: 1.5 },
                  children: lo(_),
                }),
                y.jsx('div', {
                  className: 'config-actions',
                  children: y.jsx('button', {
                    className: 'btn btn-primary',
                    onClick: I,
                    disabled: d,
                    children: d ? 'Saving...' : 'Save config',
                  }),
                }),
              ],
            }),
            a.usage &&
              y.jsxs('div', {
                className: 'section',
                children: [
                  y.jsx('h3', { children: 'Usage' }),
                  y.jsx(Ry, { label: 'Weekly', snapshot: a.usage.weekly }),
                  y.jsx(Ry, { label: 'Monthly', snapshot: a.usage.monthly }),
                  a.usage.isOutOfUsage &&
                    y.jsx('div', { className: 'badge badge-red', style: { marginTop: 8 }, children: 'Out of usage' }),
                ],
              }),
            y.jsxs('div', {
              className: 'section',
              children: [
                y.jsx('h3', { children: 'Recent Tasks' }),
                a.tasks.length === 0
                  ? y.jsx('div', { className: 'text-muted', children: 'No tasks yet' })
                  : a.tasks.map((L) =>
                      y.jsxs(
                        'div',
                        {
                          className: 'task-row',
                          children: [
                            y.jsx('span', { className: `badge ${Eb[L.status] || 'badge-gray'}`, children: L.status }),
                            y.jsx('span', { className: 'title', children: L.title || L.description }),
                            y.jsx('span', { className: 'date', children: new Date(L.createdAt).toLocaleDateString() }),
                          ],
                        },
                        L.id
                      )
                    ),
              ],
            }),
            y.jsxs('div', {
              className: 'section',
              children: [
                y.jsx('h3', { children: 'Impersonate' }),
                y.jsxs('button', { className: 'btn btn-secondary', onClick: Y, children: ['Login as ', a.name] }),
                g &&
                  y.jsxs('div', {
                    className: 'impersonate-result',
                    children: [
                      y.jsxs('div', {
                        style: { marginBottom: 8 },
                        children: ['Token generated for ', y.jsx('strong', { children: g.user.email })],
                      }),
                      y.jsxs('button', {
                        className: 'btn btn-primary',
                        onClick: () => {
                          ;(localStorage.setItem('auth_token', g.token), window.open('/app/', '_blank'))
                        },
                        children: ['Open app as ', g.user.name],
                      }),
                      y.jsx('div', {
                        style: { marginTop: 12 },
                        children: y.jsxs('details', {
                          children: [
                            y.jsx('summary', {
                              style: { cursor: 'pointer', color: '#737373', fontSize: 12 },
                              children: 'Raw token',
                            }),
                            y.jsx('code', { children: g.token }),
                          ],
                        }),
                      }),
                    ],
                  }),
              ],
            }),
          ],
        })
      : y.jsx('div', { className: 'loading', children: 'User not found' })
}
function Ry({ label: s, snapshot: l }) {
  const a = l.percent > 90 ? '#ef4444' : l.percent > 70 ? '#f59e0b' : '#22c55e'
  return y.jsxs('div', {
    className: 'usage-bar-container',
    children: [
      y.jsxs('div', {
        className: 'usage-bar-label',
        children: [
          y.jsx('span', { children: s }),
          y.jsxs('span', {
            children: [
              '$',
              (l.usedCents / 100).toFixed(2),
              ' / $',
              (l.limitCents / 100).toFixed(2),
              ' (',
              Math.round(l.percent),
              '%)',
            ],
          }),
        ],
      }),
      y.jsx('div', {
        className: 'usage-bar',
        children: y.jsx('div', {
          className: 'usage-bar-fill',
          style: { width: `${Math.min(l.percent, 100)}%`, background: a },
        }),
      }),
    ],
  })
}
function Ob() {
  const s = Date.now().toString(36),
    l = Math.random().toString(36).slice(2, 6)
  return `test_${s}_${l}@test.kanwas.ai`
}
function jb() {
  if (typeof window > 'u') return ''
  const { hostname: s } = window.location
  return s === 'localhost' || s === '127.0.0.1' ? 'http://localhost:5173' : ''
}
function wb() {
  const [s, l] = W.useState(''),
    [a, u] = W.useState(''),
    [c, f] = W.useState(''),
    [d, m] = W.useState(''),
    [g, p] = W.useState(''),
    [_, S] = W.useState(!1),
    [O, E] = W.useState(null),
    U = ao(c),
    A = ja(c),
    M = (Z) => {
      ;(f(Z), m(''), ja(Z) || p(''))
    },
    K = async () => {
      const Z = a || Ob(),
        I = s || Z.split('@')[0].replace(/_/g, ' '),
        Y = {}
      ;(c && (Y.llmProvider = c), d && (Y.llmModel = d), A && g && (Y.reasoningEffort = g), S(!0), E(null))
      try {
        const L = await I0(Z, I, Y)
        if (L.error) {
          E(L.error)
          return
        }
        ;(window.open(`${jb()}/dev-login.html?token=${L.token}`, '_blank'), l(''), u(''))
      } catch (L) {
        E(L instanceof Error ? L.message : 'Failed to create user')
      } finally {
        S(!1)
      }
    }
  return y.jsx('div', {
    style: { maxWidth: 600 },
    children: y.jsxs('div', {
      className: 'section',
      children: [
        y.jsx('h3', { children: 'Create User & Open App' }),
        y.jsx('p', {
          className: 'text-muted',
          style: { marginBottom: 16, fontSize: 13 },
          children: 'Creates a new user with a workspace and opens the app logged in as that user.',
        }),
        y.jsxs('div', {
          className: 'config-grid',
          children: [
            y.jsx('label', { children: 'Name' }),
            y.jsx('input', {
              type: 'text',
              value: s,
              onChange: (Z) => l(Z.target.value),
              placeholder: '(auto-generated)',
            }),
            y.jsx('label', { children: 'Email' }),
            y.jsx('input', {
              type: 'text',
              value: a,
              onChange: (Z) => u(Z.target.value),
              placeholder: '(auto-generated unique)',
            }),
            y.jsx('label', { children: 'Provider' }),
            y.jsxs('select', {
              value: c,
              onChange: (Z) => M(Z.target.value),
              children: [
                y.jsx('option', { value: '', children: 'System default' }),
                no().map((Z) => y.jsx('option', { value: Z.value, children: Z.label }, Z.value)),
              ],
            }),
            y.jsx('label', { children: 'Model' }),
            y.jsx('input', { type: 'text', value: d, onChange: (Z) => m(Z.target.value), placeholder: U }),
            y.jsx('label', { children: 'Reasoning' }),
            A
              ? y.jsxs('select', {
                  value: g,
                  onChange: (Z) => p(Z.target.value),
                  children: [
                    y.jsx('option', { value: '', children: U }),
                    op(c).map((Z) => y.jsx('option', { value: Z, children: Z }, Z)),
                  ],
                })
              : y.jsx('div', {
                  className: 'text-muted',
                  style: { fontSize: 13, paddingTop: 8 },
                  children: 'Automatic (adaptive on Sonnet/Opus 4.6)',
                }),
          ],
        }),
        y.jsx('p', {
          className: 'text-muted',
          style: { marginTop: 10, fontSize: 12, lineHeight: 1.5 },
          children: lo(c),
        }),
        O &&
          y.jsx('div', {
            style: {
              color: 'var(--badge-red-text)',
              background: 'var(--badge-red-bg)',
              padding: '8px 12px',
              borderRadius: 6,
              fontSize: 13,
              marginTop: 12,
            },
            children: O,
          }),
        y.jsx('div', {
          className: 'config-actions',
          children: y.jsx('button', {
            className: 'btn btn-primary',
            onClick: K,
            disabled: _,
            children: _ ? 'Creating...' : 'Create & Open',
          }),
        }),
      ],
    }),
  })
}
const kb = {
  complete: 'badge-green',
  processing: 'badge-yellow',
  waiting: 'badge-blue',
  error: 'badge-red',
  initiated: 'badge-gray',
}
function dp({ data: s, height: l = 40 }) {
  if (s.length < 2) return null
  const a = Math.max(...s, 1),
    u = 200,
    c = s.map((f, d) => `${(d / (s.length - 1)) * u},${l - (f / a) * (l - 4)}`).join(' ')
  return y.jsx('svg', {
    width: u,
    height: l,
    style: { display: 'block' },
    children: y.jsx('polyline', {
      points: c,
      fill: 'none',
      stroke: 'var(--accent)',
      strokeWidth: '1.5',
      strokeLinejoin: 'round',
    }),
  })
}
function yt({ label: s, value: l, sub: a }) {
  return y.jsxs('div', {
    className: 'stat-card',
    children: [
      y.jsx('div', { className: 'stat-value', children: l }),
      y.jsx('div', { className: 'stat-label', children: s }),
      a && y.jsx('div', { className: 'stat-sub', children: a }),
    ],
  })
}
function Cb() {
  const [s, l] = W.useState(null)
  return (
    W.useEffect(() => {
      ab().then(l).catch(console.error)
    }, []),
    s
      ? y.jsxs('div', {
          children: [
            y.jsxs('div', {
              className: 'stat-grid',
              children: [
                y.jsx(yt, { label: 'Total Users', value: s.totals.users }),
                y.jsx(yt, { label: 'Organizations', value: s.totals.organizations }),
                y.jsx(yt, { label: 'Workspaces', value: s.totals.workspaces }),
              ],
            }),
            y.jsxs('div', {
              className: 'dashboard-row',
              children: [
                y.jsxs('div', {
                  className: 'section',
                  children: [
                    y.jsx('h3', { children: 'New Signups' }),
                    y.jsxs('div', {
                      className: 'stat-grid stat-grid-3',
                      children: [
                        y.jsx(yt, { label: 'Today', value: s.signups.today }),
                        y.jsx(yt, { label: 'This Week', value: s.signups.thisWeek }),
                        y.jsx(yt, { label: 'This Month', value: s.signups.thisMonth }),
                      ],
                    }),
                    y.jsxs('div', {
                      style: { marginTop: 16 },
                      children: [
                        y.jsx('div', { className: 'stat-label', style: { marginBottom: 8 }, children: 'Last 30 days' }),
                        y.jsx(dp, { data: s.dailySignups.map((a) => a.count) }),
                      ],
                    }),
                  ],
                }),
                y.jsxs('div', {
                  className: 'section',
                  children: [
                    y.jsxs('h3', {
                      children: [
                        'Active Users',
                        ' ',
                        y.jsx('span', {
                          className: 'text-muted',
                          style: { fontSize: 12, fontWeight: 400 },
                          children: '— users who created at least one task',
                        }),
                      ],
                    }),
                    y.jsxs('div', {
                      className: 'stat-grid stat-grid-3',
                      children: [
                        y.jsx(yt, { label: 'Today', value: s.activeUsers.today }),
                        y.jsx(yt, { label: 'This Week', value: s.activeUsers.thisWeek }),
                        y.jsx(yt, { label: 'This Month', value: s.activeUsers.thisMonth }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ],
        })
      : y.jsx('div', { className: 'loading', children: 'Loading...' })
  )
}
function Mb({ onNavigateUser: s }) {
  const [l, a] = W.useState(null)
  return (
    W.useEffect(() => {
      cb().then(a).catch(console.error)
    }, []),
    l
      ? y.jsxs('div', {
          children: [
            y.jsxs('div', {
              className: 'stat-grid',
              children: [
                y.jsx(yt, { label: 'Tasks Today', value: l.tasks.today }),
                y.jsx(yt, { label: 'This Week', value: l.tasks.thisWeek }),
                y.jsx(yt, { label: 'This Month', value: l.tasks.thisMonth }),
                y.jsx(yt, { label: 'Total', value: l.tasks.total }),
              ],
            }),
            y.jsxs('div', {
              className: 'dashboard-row',
              children: [
                y.jsxs('div', {
                  className: 'section',
                  children: [
                    y.jsx('h3', { children: 'Status Breakdown (30d)' }),
                    y.jsx('div', {
                      className: 'status-bars',
                      children: l.statusBreakdown.map((u) => {
                        const c = l.statusBreakdown.reduce((d, m) => d + m.count, 0) || 1,
                          f = (u.count / c) * 100
                        return y.jsxs(
                          'div',
                          {
                            className: 'status-bar-row',
                            children: [
                              y.jsx('span', { className: `badge ${kb[u.status] || 'badge-gray'}`, children: u.status }),
                              y.jsx('div', {
                                className: 'status-bar-track',
                                children: y.jsx('div', {
                                  'className': 'status-bar-fill',
                                  'style': { width: `${f}%` },
                                  'data-status': u.status,
                                }),
                              }),
                              y.jsx('span', { className: 'status-bar-count', children: u.count }),
                            ],
                          },
                          u.status
                        )
                      }),
                    }),
                    l.errorRate > 0 &&
                      y.jsxs('div', {
                        style: { marginTop: 12, fontSize: 13 },
                        children: [
                          'Error rate: ',
                          y.jsxs('span', {
                            className: l.errorRate > 5 ? 'text-danger' : '',
                            children: [l.errorRate, '%'],
                          }),
                        ],
                      }),
                  ],
                }),
                y.jsxs('div', {
                  className: 'section',
                  children: [
                    y.jsx('h3', { children: 'Tasks per Day (30d)' }),
                    y.jsx(dp, { data: l.dailyTasks.map((u) => u.count), height: 60 }),
                  ],
                }),
              ],
            }),
            y.jsxs('div', {
              className: 'section',
              children: [
                y.jsx('h3', { children: 'Top Users (30d)' }),
                y.jsxs('table', {
                  children: [
                    y.jsx('thead', {
                      children: y.jsxs('tr', {
                        children: [
                          y.jsx('th', { children: 'User' }),
                          y.jsx('th', { children: 'Email' }),
                          y.jsx('th', { style: { textAlign: 'right' }, children: 'Tasks' }),
                        ],
                      }),
                    }),
                    y.jsx('tbody', {
                      children: l.topUsers.map((u) =>
                        y.jsxs(
                          'tr',
                          {
                            onClick: () => s(u.id),
                            children: [
                              y.jsx('td', { children: u.name }),
                              y.jsx('td', { className: 'text-muted', children: u.email }),
                              y.jsx('td', {
                                style: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
                                children: u.taskCount,
                              }),
                            ],
                          },
                          u.id
                        )
                      ),
                    }),
                  ],
                }),
              ],
            }),
            l.recentErrors.length > 0 &&
              y.jsxs('div', {
                className: 'section',
                children: [
                  y.jsx('h3', { children: 'Recent Errors' }),
                  l.recentErrors
                    .slice(0, 10)
                    .map((u) =>
                      y.jsxs(
                        'div',
                        {
                          className: 'task-row',
                          children: [
                            y.jsx('span', { className: 'badge badge-red', children: 'error' }),
                            y.jsx('span', { className: 'title', children: u.title || u.description || '(untitled)' }),
                            y.jsx('span', { className: 'text-muted', style: { fontSize: 12 }, children: u.userName }),
                            y.jsx('span', { className: 'date', children: new Date(u.createdAt).toLocaleDateString() }),
                          ],
                        },
                        u.id
                      )
                    ),
                ],
              }),
          ],
        })
      : y.jsx('div', { className: 'loading', children: 'Loading...' })
  )
}
function Db() {
  const [s, l] = W.useState(null)
  if (
    (W.useEffect(() => {
      rb().then(l).catch(console.error)
    }, []),
    !s)
  )
    return y.jsx('div', { className: 'loading', children: 'Loading...' })
  const a = (u) => `$${(u / 100).toFixed(2)}`
  return y.jsxs('div', {
    children: [
      y.jsxs('div', {
        className: 'stat-grid',
        children: [
          y.jsx(yt, { label: 'Weekly Spend (all orgs)', value: a(s.totalSpend.weeklyCents) }),
          y.jsx(yt, { label: 'Monthly Spend (all orgs)', value: a(s.totalSpend.monthlyCents) }),
        ],
      }),
      y.jsxs('div', {
        className: 'section',
        children: [
          y.jsx('h3', { children: 'Organizations' }),
          y.jsxs('table', {
            children: [
              y.jsx('thead', {
                children: y.jsxs('tr', {
                  children: [
                    y.jsx('th', { children: 'Organization' }),
                    y.jsx('th', { style: { textAlign: 'right' }, children: 'Weekly' }),
                    y.jsx('th', { style: { textAlign: 'right' }, children: 'Limit' }),
                    y.jsx('th', { style: { textAlign: 'right' }, children: 'Monthly' }),
                    y.jsx('th', { style: { textAlign: 'right' }, children: 'Limit' }),
                    y.jsx('th', { children: 'Status' }),
                  ],
                }),
              }),
              y.jsxs('tbody', {
                children: [
                  s.organizations.map((u) => {
                    const c = u.weeklyPercent > 80 || u.monthlyPercent > 80,
                      f = u.weeklyPercent > 95 || u.monthlyPercent > 95
                    return y.jsxs(
                      'tr',
                      {
                        style: { cursor: 'default' },
                        children: [
                          y.jsx('td', { children: u.name }),
                          y.jsx('td', {
                            style: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
                            children: a(u.weeklySpendCents),
                          }),
                          y.jsx('td', {
                            style: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
                            className: 'text-muted',
                            children: a(u.weeklyLimitCents),
                          }),
                          y.jsx('td', {
                            style: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
                            children: a(u.monthlySpendCents),
                          }),
                          y.jsx('td', {
                            style: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
                            className: 'text-muted',
                            children: a(u.monthlyLimitCents),
                          }),
                          y.jsx('td', {
                            children: f
                              ? y.jsx('span', { className: 'badge badge-red', children: 'at limit' })
                              : c
                                ? y.jsx('span', { className: 'badge badge-yellow', children: 'approaching' })
                                : y.jsx('span', { className: 'badge badge-green', children: 'ok' }),
                          }),
                        ],
                      },
                      u.id
                    )
                  }),
                  s.organizations.length === 0 &&
                    y.jsx('tr', {
                      style: { cursor: 'default' },
                      children: y.jsx('td', {
                        colSpan: 6,
                        className: 'text-muted',
                        style: { textAlign: 'center', padding: 24 },
                        children: 'No usage data yet',
                      }),
                    }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  })
}
function zb({ tab: s, onTabChange: l, onNavigateUser: a }) {
  return y.jsxs('div', {
    children: [
      y.jsx('div', {
        className: 'tab-bar',
        children: ['overview', 'usage', 'cost'].map((u) =>
          y.jsx(
            'button',
            {
              className: `tab ${s === u ? 'active' : ''}`,
              onClick: () => l(u),
              children: u === 'overview' ? 'Overview' : u === 'usage' ? 'Agent Usage' : 'Cost',
            },
            u
          )
        ),
      }),
      s === 'overview' && y.jsx(Cb, {}),
      s === 'usage' && y.jsx(Mb, { onNavigateUser: a }),
      s === 'cost' && y.jsx(Db, {}),
    ],
  })
}
function Lb() {
  const [s, l] = W.useState([]),
    [a, u] = W.useState(!0),
    [c, f] = W.useState(null),
    [d, m] = W.useState(''),
    [g, p] = W.useState(!1),
    _ = async () => {
      f(null)
      try {
        const E = await ib()
        l(E)
      } catch (E) {
        f(E instanceof Error ? E.message : 'Failed to load embed templates')
      } finally {
        u(!1)
      }
    }
  W.useEffect(() => {
    _()
  }, [])
  const S = async (E) => {
      E.preventDefault()
      const U = d.trim()
      if (U) {
        ;(p(!0), f(null))
        try {
          ;(await sb(U), m(''), await _())
        } catch (A) {
          f(A instanceof Error ? A.message : 'Failed to add embed template')
        } finally {
          p(!1)
        }
      }
    },
    O = async (E) => {
      if (confirm('Remove embed template flag from this workspace?')) {
        f(null)
        try {
          ;(await ub(E), await _())
        } catch (U) {
          f(U instanceof Error ? U.message : 'Failed to remove embed template')
        }
      }
    }
  return y.jsxs(y.Fragment, {
    children: [
      y.jsx('div', {
        className: 'search-bar',
        style: { display: 'flex', gap: 8, alignItems: 'center' },
        children: y.jsxs('form', {
          onSubmit: S,
          style: { display: 'flex', gap: 8, flex: 1 },
          children: [
            y.jsx('input', {
              type: 'text',
              placeholder: 'Workspace UUID to flag as embed template',
              value: d,
              onChange: (E) => m(E.target.value),
              disabled: g,
              style: { flex: 1 },
            }),
            y.jsx('button', { type: 'submit', disabled: g || !d.trim(), children: g ? 'Adding…' : 'Add template' }),
          ],
        }),
      }),
      c
        ? y.jsx('div', {
            className: 'text-muted',
            style: { color: 'var(--badge-red-text)', padding: '8px 0' },
            children: c,
          })
        : null,
      a
        ? y.jsx('div', { className: 'loading', children: 'Loading...' })
        : y.jsxs('table', {
            children: [
              y.jsx('thead', {
                children: y.jsxs('tr', {
                  children: [
                    y.jsx('th', { children: 'Name' }),
                    y.jsx('th', { children: 'Workspace ID' }),
                    y.jsx('th', { children: 'Organization' }),
                    y.jsx('th', { children: 'Created' }),
                    y.jsx('th', { style: { width: 1 } }),
                  ],
                }),
              }),
              y.jsxs('tbody', {
                children: [
                  s.map((E) =>
                    y.jsxs(
                      'tr',
                      {
                        children: [
                          y.jsx('td', { children: E.name }),
                          y.jsx('td', { className: 'text-muted', children: y.jsx('code', { children: E.id }) }),
                          y.jsx('td', {
                            className: 'text-muted',
                            children: y.jsx('code', { children: E.organizationId }),
                          }),
                          y.jsx('td', {
                            className: 'text-muted',
                            children: new Date(E.createdAt).toLocaleDateString(),
                          }),
                          y.jsx('td', {
                            children: y.jsx('button', { type: 'button', onClick: () => O(E.id), children: 'Remove' }),
                          }),
                        ],
                      },
                      E.id
                    )
                  ),
                  s.length === 0 &&
                    y.jsx('tr', {
                      children: y.jsx('td', {
                        colSpan: 5,
                        className: 'text-muted',
                        style: { textAlign: 'center', padding: 40 },
                        children: 'No embed templates yet',
                      }),
                    }),
                ],
              }),
            ],
          }),
    ],
  })
}
function Rb() {
  const [s, l] = W.useState(!0),
    [a, u] = W.useState(!1),
    [c, f] = W.useState(''),
    [d, m] = W.useState(''),
    [g, p] = W.useState(''),
    [_, S] = W.useState(null),
    [O, E] = W.useState(null),
    U = ao(c),
    A = zy(c)
  W.useEffect(() => {
    ;(l(!0),
      F0()
        .then(({ config: Y }) => {
          ;(f(Y.llmProvider || ''), m(Y.llmModel || ''), p(Y.llmServiceTier || ''))
        })
        .catch((Y) => S(Y instanceof Error ? Y.message : 'Failed to load LLM defaults'))
        .finally(() => l(!1)))
  }, [])
  const M = (Y) => {
      ;(f(Y), m(''), zy(Y) || p(''), E(null))
    },
    K = async (Y, L) => {
      ;(u(!0), S(null), E(null))
      try {
        const $ = await P0(Y)
        ;(f($.config.llmProvider || ''), m($.config.llmModel || ''), p($.config.llmServiceTier || ''), E(L))
      } catch ($) {
        S($ instanceof Error ? $.message : 'Failed to save LLM defaults')
      } finally {
        u(!1)
      }
    },
    Z = () => {
      K({ llmProvider: Bl(c) ?? null, llmModel: d || null, llmServiceTier: (A && g) || null }, 'Saved LLM defaults')
    },
    I = () => {
      K({ llmProvider: null, llmModel: null, llmServiceTier: null }, 'Cleared LLM defaults')
    }
  return s
    ? y.jsx('div', { className: 'loading', children: 'Loading...' })
    : y.jsx('div', {
        className: 'llm-defaults',
        children: y.jsxs('div', {
          className: 'section',
          children: [
            y.jsx('h3', { children: 'LLM Defaults' }),
            y.jsxs('div', {
              className: 'config-grid',
              children: [
                y.jsx('label', { children: 'Provider' }),
                y.jsxs('select', {
                  value: c,
                  onChange: (Y) => M(Y.target.value),
                  children: [
                    y.jsx('option', { value: '', children: 'System default' }),
                    no().map((Y) => y.jsx('option', { value: Y.value, children: Y.label }, Y.value)),
                  ],
                }),
                y.jsx('label', { children: 'Model' }),
                y.jsx('input', {
                  type: 'text',
                  value: d,
                  onChange: (Y) => {
                    ;(m(Y.target.value), E(null))
                  },
                  placeholder: U,
                }),
                A &&
                  y.jsxs(y.Fragment, {
                    children: [
                      y.jsx('label', { children: 'Service tier' }),
                      y.jsxs('select', {
                        value: g,
                        onChange: (Y) => {
                          ;(p(Y.target.value), E(null))
                        },
                        children: [
                          y.jsx('option', { value: '', children: 'Project/API default' }),
                          Nb().map((Y) =>
                            y.jsx(
                              'option',
                              { value: Y, children: Y === 'priority' ? 'Priority (faster)' : 'Default (standard)' },
                              Y
                            )
                          ),
                        ],
                      }),
                    ],
                  }),
              ],
            }),
            y.jsx('p', {
              className: 'text-muted',
              style: { marginTop: 10, fontSize: 12, lineHeight: 1.5 },
              children: lo(c),
            }),
            _ && y.jsx('div', { className: 'template-error', children: _ }),
            O && y.jsx('div', { className: 'template-success', children: O }),
            y.jsxs('div', {
              className: 'config-actions',
              children: [
                y.jsx('button', {
                  className: 'btn btn-primary',
                  onClick: Z,
                  disabled: a,
                  children: a ? 'Saving...' : 'Save defaults',
                }),
                y.jsx('button', { className: 'btn btn-secondary', onClick: I, disabled: a, children: 'Clear' }),
              ],
            }),
          ],
        }),
      })
}
var Oe
;(function (s) {
  s.assertEqual = (c) => {}
  function l(c) {}
  s.assertIs = l
  function a(c) {
    throw new Error()
  }
  ;((s.assertNever = a),
    (s.arrayToEnum = (c) => {
      const f = {}
      for (const d of c) f[d] = d
      return f
    }),
    (s.getValidEnumValues = (c) => {
      const f = s.objectKeys(c).filter((m) => typeof c[c[m]] != 'number'),
        d = {}
      for (const m of f) d[m] = c[m]
      return s.objectValues(d)
    }),
    (s.objectValues = (c) =>
      s.objectKeys(c).map(function (f) {
        return c[f]
      })),
    (s.objectKeys =
      typeof Object.keys == 'function'
        ? (c) => Object.keys(c)
        : (c) => {
            const f = []
            for (const d in c) Object.prototype.hasOwnProperty.call(c, d) && f.push(d)
            return f
          }),
    (s.find = (c, f) => {
      for (const d of c) if (f(d)) return d
    }),
    (s.isInteger =
      typeof Number.isInteger == 'function'
        ? (c) => Number.isInteger(c)
        : (c) => typeof c == 'number' && Number.isFinite(c) && Math.floor(c) === c))
  function u(c, f = ' | ') {
    return c.map((d) => (typeof d == 'string' ? `'${d}'` : d)).join(f)
  }
  ;((s.joinValues = u), (s.jsonStringifyReplacer = (c, f) => (typeof f == 'bigint' ? f.toString() : f)))
})(Oe || (Oe = {}))
var Uy
;(function (s) {
  s.mergeShapes = (l, a) => ({ ...l, ...a })
})(Uy || (Uy = {}))
const te = Oe.arrayToEnum([
    'string',
    'nan',
    'number',
    'integer',
    'float',
    'boolean',
    'date',
    'bigint',
    'symbol',
    'function',
    'undefined',
    'null',
    'array',
    'object',
    'unknown',
    'promise',
    'void',
    'never',
    'map',
    'set',
  ]),
  il = (s) => {
    switch (typeof s) {
      case 'undefined':
        return te.undefined
      case 'string':
        return te.string
      case 'number':
        return Number.isNaN(s) ? te.nan : te.number
      case 'boolean':
        return te.boolean
      case 'function':
        return te.function
      case 'bigint':
        return te.bigint
      case 'symbol':
        return te.symbol
      case 'object':
        return Array.isArray(s)
          ? te.array
          : s === null
            ? te.null
            : s.then && typeof s.then == 'function' && s.catch && typeof s.catch == 'function'
              ? te.promise
              : typeof Map < 'u' && s instanceof Map
                ? te.map
                : typeof Set < 'u' && s instanceof Set
                  ? te.set
                  : typeof Date < 'u' && s instanceof Date
                    ? te.date
                    : te.object
      default:
        return te.unknown
    }
  },
  V = Oe.arrayToEnum([
    'invalid_type',
    'invalid_literal',
    'custom',
    'invalid_union',
    'invalid_union_discriminator',
    'invalid_enum_value',
    'unrecognized_keys',
    'invalid_arguments',
    'invalid_return_type',
    'invalid_date',
    'invalid_string',
    'too_small',
    'too_big',
    'invalid_intersection_types',
    'not_multiple_of',
    'not_finite',
  ])
class Dn extends Error {
  get errors() {
    return this.issues
  }
  constructor(l) {
    ;(super(),
      (this.issues = []),
      (this.addIssue = (u) => {
        this.issues = [...this.issues, u]
      }),
      (this.addIssues = (u = []) => {
        this.issues = [...this.issues, ...u]
      }))
    const a = new.target.prototype
    ;(Object.setPrototypeOf ? Object.setPrototypeOf(this, a) : (this.__proto__ = a),
      (this.name = 'ZodError'),
      (this.issues = l))
  }
  format(l) {
    const a =
        l ||
        function (f) {
          return f.message
        },
      u = { _errors: [] },
      c = (f) => {
        for (const d of f.issues)
          if (d.code === 'invalid_union') d.unionErrors.map(c)
          else if (d.code === 'invalid_return_type') c(d.returnTypeError)
          else if (d.code === 'invalid_arguments') c(d.argumentsError)
          else if (d.path.length === 0) u._errors.push(a(d))
          else {
            let m = u,
              g = 0
            for (; g < d.path.length; ) {
              const p = d.path[g]
              ;(g === d.path.length - 1
                ? ((m[p] = m[p] || { _errors: [] }), m[p]._errors.push(a(d)))
                : (m[p] = m[p] || { _errors: [] }),
                (m = m[p]),
                g++)
            }
          }
      }
    return (c(this), u)
  }
  static assert(l) {
    if (!(l instanceof Dn)) throw new Error(`Not a ZodError: ${l}`)
  }
  toString() {
    return this.message
  }
  get message() {
    return JSON.stringify(this.issues, Oe.jsonStringifyReplacer, 2)
  }
  get isEmpty() {
    return this.issues.length === 0
  }
  flatten(l = (a) => a.message) {
    const a = {},
      u = []
    for (const c of this.issues)
      if (c.path.length > 0) {
        const f = c.path[0]
        ;((a[f] = a[f] || []), a[f].push(l(c)))
      } else u.push(l(c))
    return { formErrors: u, fieldErrors: a }
  }
  get formErrors() {
    return this.flatten()
  }
}
Dn.create = (s) => new Dn(s)
const Hf = (s, l) => {
  let a
  switch (s.code) {
    case V.invalid_type:
      s.received === te.undefined ? (a = 'Required') : (a = `Expected ${s.expected}, received ${s.received}`)
      break
    case V.invalid_literal:
      a = `Invalid literal value, expected ${JSON.stringify(s.expected, Oe.jsonStringifyReplacer)}`
      break
    case V.unrecognized_keys:
      a = `Unrecognized key(s) in object: ${Oe.joinValues(s.keys, ', ')}`
      break
    case V.invalid_union:
      a = 'Invalid input'
      break
    case V.invalid_union_discriminator:
      a = `Invalid discriminator value. Expected ${Oe.joinValues(s.options)}`
      break
    case V.invalid_enum_value:
      a = `Invalid enum value. Expected ${Oe.joinValues(s.options)}, received '${s.received}'`
      break
    case V.invalid_arguments:
      a = 'Invalid function arguments'
      break
    case V.invalid_return_type:
      a = 'Invalid function return type'
      break
    case V.invalid_date:
      a = 'Invalid date'
      break
    case V.invalid_string:
      typeof s.validation == 'object'
        ? 'includes' in s.validation
          ? ((a = `Invalid input: must include "${s.validation.includes}"`),
            typeof s.validation.position == 'number' &&
              (a = `${a} at one or more positions greater than or equal to ${s.validation.position}`))
          : 'startsWith' in s.validation
            ? (a = `Invalid input: must start with "${s.validation.startsWith}"`)
            : 'endsWith' in s.validation
              ? (a = `Invalid input: must end with "${s.validation.endsWith}"`)
              : Oe.assertNever(s.validation)
        : s.validation !== 'regex'
          ? (a = `Invalid ${s.validation}`)
          : (a = 'Invalid')
      break
    case V.too_small:
      s.type === 'array'
        ? (a = `Array must contain ${s.exact ? 'exactly' : s.inclusive ? 'at least' : 'more than'} ${s.minimum} element(s)`)
        : s.type === 'string'
          ? (a = `String must contain ${s.exact ? 'exactly' : s.inclusive ? 'at least' : 'over'} ${s.minimum} character(s)`)
          : s.type === 'number'
            ? (a = `Number must be ${s.exact ? 'exactly equal to ' : s.inclusive ? 'greater than or equal to ' : 'greater than '}${s.minimum}`)
            : s.type === 'bigint'
              ? (a = `Number must be ${s.exact ? 'exactly equal to ' : s.inclusive ? 'greater than or equal to ' : 'greater than '}${s.minimum}`)
              : s.type === 'date'
                ? (a = `Date must be ${s.exact ? 'exactly equal to ' : s.inclusive ? 'greater than or equal to ' : 'greater than '}${new Date(Number(s.minimum))}`)
                : (a = 'Invalid input')
      break
    case V.too_big:
      s.type === 'array'
        ? (a = `Array must contain ${s.exact ? 'exactly' : s.inclusive ? 'at most' : 'less than'} ${s.maximum} element(s)`)
        : s.type === 'string'
          ? (a = `String must contain ${s.exact ? 'exactly' : s.inclusive ? 'at most' : 'under'} ${s.maximum} character(s)`)
          : s.type === 'number'
            ? (a = `Number must be ${s.exact ? 'exactly' : s.inclusive ? 'less than or equal to' : 'less than'} ${s.maximum}`)
            : s.type === 'bigint'
              ? (a = `BigInt must be ${s.exact ? 'exactly' : s.inclusive ? 'less than or equal to' : 'less than'} ${s.maximum}`)
              : s.type === 'date'
                ? (a = `Date must be ${s.exact ? 'exactly' : s.inclusive ? 'smaller than or equal to' : 'smaller than'} ${new Date(Number(s.maximum))}`)
                : (a = 'Invalid input')
      break
    case V.custom:
      a = 'Invalid input'
      break
    case V.invalid_intersection_types:
      a = 'Intersection results could not be merged'
      break
    case V.not_multiple_of:
      a = `Number must be a multiple of ${s.multipleOf}`
      break
    case V.not_finite:
      a = 'Number must be finite'
      break
    default:
      ;((a = l.defaultError), Oe.assertNever(s))
  }
  return { message: a }
}
let Ub = Hf
function Bb() {
  return Ub
}
const qb = (s) => {
  const { data: l, path: a, errorMaps: u, issueData: c } = s,
    f = [...a, ...(c.path || [])],
    d = { ...c, path: f }
  if (c.message !== void 0) return { ...c, path: f, message: c.message }
  let m = ''
  const g = u
    .filter((p) => !!p)
    .slice()
    .reverse()
  for (const p of g) m = p(d, { data: l, defaultError: m }).message
  return { ...c, path: f, message: m }
}
function P(s, l) {
  const a = Bb(),
    u = qb({
      issueData: l,
      data: s.data,
      path: s.path,
      errorMaps: [s.common.contextualErrorMap, s.schemaErrorMap, a, a === Hf ? void 0 : Hf].filter((c) => !!c),
    })
  s.common.issues.push(u)
}
class gt {
  constructor() {
    this.value = 'valid'
  }
  dirty() {
    this.value === 'valid' && (this.value = 'dirty')
  }
  abort() {
    this.value !== 'aborted' && (this.value = 'aborted')
  }
  static mergeArray(l, a) {
    const u = []
    for (const c of a) {
      if (c.status === 'aborted') return fe
      ;(c.status === 'dirty' && l.dirty(), u.push(c.value))
    }
    return { status: l.value, value: u }
  }
  static async mergeObjectAsync(l, a) {
    const u = []
    for (const c of a) {
      const f = await c.key,
        d = await c.value
      u.push({ key: f, value: d })
    }
    return gt.mergeObjectSync(l, u)
  }
  static mergeObjectSync(l, a) {
    const u = {}
    for (const c of a) {
      const { key: f, value: d } = c
      if (f.status === 'aborted' || d.status === 'aborted') return fe
      ;(f.status === 'dirty' && l.dirty(),
        d.status === 'dirty' && l.dirty(),
        f.value !== '__proto__' && (typeof d.value < 'u' || c.alwaysSet) && (u[f.value] = d.value))
    }
    return { status: l.value, value: u }
  }
}
const fe = Object.freeze({ status: 'aborted' }),
  Ki = (s) => ({ status: 'dirty', value: s }),
  Wt = (s) => ({ status: 'valid', value: s }),
  By = (s) => s.status === 'aborted',
  qy = (s) => s.status === 'dirty',
  La = (s) => s.status === 'valid',
  ku = (s) => typeof Promise < 'u' && s instanceof Promise
var ae
;(function (s) {
  ;((s.errToObj = (l) => (typeof l == 'string' ? { message: l } : l || {})),
    (s.toString = (l) => (typeof l == 'string' ? l : l == null ? void 0 : l.message)))
})(ae || (ae = {}))
class fn {
  constructor(l, a, u, c) {
    ;((this._cachedPath = []), (this.parent = l), (this.data = a), (this._path = u), (this._key = c))
  }
  get path() {
    return (
      this._cachedPath.length ||
        (Array.isArray(this._key)
          ? this._cachedPath.push(...this._path, ...this._key)
          : this._cachedPath.push(...this._path, this._key)),
      this._cachedPath
    )
  }
}
const Hy = (s, l) => {
  if (La(l)) return { success: !0, data: l.value }
  if (!s.common.issues.length) throw new Error('Validation failed but no issues detected.')
  return {
    success: !1,
    get error() {
      if (this._error) return this._error
      const a = new Dn(s.common.issues)
      return ((this._error = a), this._error)
    },
  }
}
function pe(s) {
  if (!s) return {}
  const { errorMap: l, invalid_type_error: a, required_error: u, description: c } = s
  if (l && (a || u))
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`)
  return l
    ? { errorMap: l, description: c }
    : {
        errorMap: (d, m) => {
          const { message: g } = s
          return d.code === 'invalid_enum_value'
            ? { message: g ?? m.defaultError }
            : typeof m.data > 'u'
              ? { message: g ?? u ?? m.defaultError }
              : d.code !== 'invalid_type'
                ? { message: m.defaultError }
                : { message: g ?? a ?? m.defaultError }
        },
        description: c,
      }
}
class xe {
  get 'description'() {
    return this._def.description
  }
  '_getType'(l) {
    return il(l.data)
  }
  '_getOrReturnCtx'(l, a) {
    return (
      a || {
        common: l.parent.common,
        data: l.data,
        parsedType: il(l.data),
        schemaErrorMap: this._def.errorMap,
        path: l.path,
        parent: l.parent,
      }
    )
  }
  '_processInputParams'(l) {
    return {
      status: new gt(),
      ctx: {
        common: l.parent.common,
        data: l.data,
        parsedType: il(l.data),
        schemaErrorMap: this._def.errorMap,
        path: l.path,
        parent: l.parent,
      },
    }
  }
  '_parseSync'(l) {
    const a = this._parse(l)
    if (ku(a)) throw new Error('Synchronous parse encountered promise.')
    return a
  }
  '_parseAsync'(l) {
    const a = this._parse(l)
    return Promise.resolve(a)
  }
  'parse'(l, a) {
    const u = this.safeParse(l, a)
    if (u.success) return u.data
    throw u.error
  }
  'safeParse'(l, a) {
    const u = {
        common: {
          issues: [],
          async: (a == null ? void 0 : a.async) ?? !1,
          contextualErrorMap: a == null ? void 0 : a.errorMap,
        },
        path: (a == null ? void 0 : a.path) || [],
        schemaErrorMap: this._def.errorMap,
        parent: null,
        data: l,
        parsedType: il(l),
      },
      c = this._parseSync({ data: l, path: u.path, parent: u })
    return Hy(u, c)
  }
  '~validate'(l) {
    var u, c
    const a = {
      common: { issues: [], async: !!this['~standard'].async },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data: l,
      parsedType: il(l),
    }
    if (!this['~standard'].async)
      try {
        const f = this._parseSync({ data: l, path: [], parent: a })
        return La(f) ? { value: f.value } : { issues: a.common.issues }
      } catch (f) {
        ;((c = (u = f == null ? void 0 : f.message) == null ? void 0 : u.toLowerCase()) != null &&
          c.includes('encountered') &&
          (this['~standard'].async = !0),
          (a.common = { issues: [], async: !0 }))
      }
    return this._parseAsync({ data: l, path: [], parent: a }).then((f) =>
      La(f) ? { value: f.value } : { issues: a.common.issues }
    )
  }
  async 'parseAsync'(l, a) {
    const u = await this.safeParseAsync(l, a)
    if (u.success) return u.data
    throw u.error
  }
  async 'safeParseAsync'(l, a) {
    const u = {
        common: { issues: [], contextualErrorMap: a == null ? void 0 : a.errorMap, async: !0 },
        path: (a == null ? void 0 : a.path) || [],
        schemaErrorMap: this._def.errorMap,
        parent: null,
        data: l,
        parsedType: il(l),
      },
      c = this._parse({ data: l, path: u.path, parent: u }),
      f = await (ku(c) ? c : Promise.resolve(c))
    return Hy(u, f)
  }
  'refine'(l, a) {
    const u = (c) => (typeof a == 'string' || typeof a > 'u' ? { message: a } : typeof a == 'function' ? a(c) : a)
    return this._refinement((c, f) => {
      const d = l(c),
        m = () => f.addIssue({ code: V.custom, ...u(c) })
      return typeof Promise < 'u' && d instanceof Promise ? d.then((g) => (g ? !0 : (m(), !1))) : d ? !0 : (m(), !1)
    })
  }
  'refinement'(l, a) {
    return this._refinement((u, c) => (l(u) ? !0 : (c.addIssue(typeof a == 'function' ? a(u, c) : a), !1)))
  }
  '_refinement'(l) {
    return new Ba({ schema: this, typeName: re.ZodEffects, effect: { type: 'refinement', refinement: l } })
  }
  'superRefine'(l) {
    return this._refinement(l)
  }
  'constructor'(l) {
    ;((this.spa = this.safeParseAsync),
      (this._def = l),
      (this.parse = this.parse.bind(this)),
      (this.safeParse = this.safeParse.bind(this)),
      (this.parseAsync = this.parseAsync.bind(this)),
      (this.safeParseAsync = this.safeParseAsync.bind(this)),
      (this.spa = this.spa.bind(this)),
      (this.refine = this.refine.bind(this)),
      (this.refinement = this.refinement.bind(this)),
      (this.superRefine = this.superRefine.bind(this)),
      (this.optional = this.optional.bind(this)),
      (this.nullable = this.nullable.bind(this)),
      (this.nullish = this.nullish.bind(this)),
      (this.array = this.array.bind(this)),
      (this.promise = this.promise.bind(this)),
      (this.or = this.or.bind(this)),
      (this.and = this.and.bind(this)),
      (this.transform = this.transform.bind(this)),
      (this.brand = this.brand.bind(this)),
      (this.default = this.default.bind(this)),
      (this.catch = this.catch.bind(this)),
      (this.describe = this.describe.bind(this)),
      (this.pipe = this.pipe.bind(this)),
      (this.readonly = this.readonly.bind(this)),
      (this.isNullable = this.isNullable.bind(this)),
      (this.isOptional = this.isOptional.bind(this)),
      (this['~standard'] = { version: 1, vendor: 'zod', validate: (a) => this['~validate'](a) }))
  }
  'optional'() {
    return ul.create(this, this._def)
  }
  'nullable'() {
    return qa.create(this, this._def)
  }
  'nullish'() {
    return this.nullable().optional()
  }
  'array'() {
    return cn.create(this)
  }
  'promise'() {
    return Lu.create(this, this._def)
  }
  'or'(l) {
    return Mu.create([this, l], this._def)
  }
  'and'(l) {
    return Du.create(this, l, this._def)
  }
  'transform'(l) {
    return new Ba({
      ...pe(this._def),
      schema: this,
      typeName: re.ZodEffects,
      effect: { type: 'transform', transform: l },
    })
  }
  'default'(l) {
    const a = typeof l == 'function' ? l : () => l
    return new Kf({ ...pe(this._def), innerType: this, defaultValue: a, typeName: re.ZodDefault })
  }
  'brand'() {
    return new c1({ typeName: re.ZodBranded, type: this, ...pe(this._def) })
  }
  'catch'(l) {
    const a = typeof l == 'function' ? l : () => l
    return new Gf({ ...pe(this._def), innerType: this, catchValue: a, typeName: re.ZodCatch })
  }
  'describe'(l) {
    const a = this.constructor
    return new a({ ...this._def, description: l })
  }
  'pipe'(l) {
    return io.create(this, l)
  }
  'readonly'() {
    return $f.create(this)
  }
  'isOptional'() {
    return this.safeParse(void 0).success
  }
  'isNullable'() {
    return this.safeParse(null).success
  }
}
const Hb = /^c[^\s-]{8,}$/i,
  Yb = /^[0-9a-z]+$/,
  Zb = /^[0-9A-HJKMNP-TV-Z]{26}$/i,
  Vb = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i,
  Kb = /^[a-z0-9_-]{21}$/i,
  Gb = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/,
  $b =
    /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/,
  Qb = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i,
  Xb = '^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$'
let wf
const Jb =
    /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/,
  Ib =
    /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/,
  Wb =
    /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/,
  Fb =
    /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/,
  Pb = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/,
  e1 = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/,
  hp =
    '((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))',
  t1 = new RegExp(`^${hp}$`)
function mp(s) {
  let l = '[0-5]\\d'
  s.precision ? (l = `${l}\\.\\d{${s.precision}}`) : s.precision == null && (l = `${l}(\\.\\d+)?`)
  const a = s.precision ? '+' : '?'
  return `([01]\\d|2[0-3]):[0-5]\\d(:${l})${a}`
}
function n1(s) {
  return new RegExp(`^${mp(s)}$`)
}
function l1(s) {
  let l = `${hp}T${mp(s)}`
  const a = []
  return (
    a.push(s.local ? 'Z?' : 'Z'),
    s.offset && a.push('([+-]\\d{2}:?\\d{2})'),
    (l = `${l}(${a.join('|')})`),
    new RegExp(`^${l}$`)
  )
}
function a1(s, l) {
  return !!(((l === 'v4' || !l) && Jb.test(s)) || ((l === 'v6' || !l) && Wb.test(s)))
}
function i1(s, l) {
  if (!Gb.test(s)) return !1
  try {
    const [a] = s.split('.')
    if (!a) return !1
    const u = a
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(a.length + ((4 - (a.length % 4)) % 4), '='),
      c = JSON.parse(atob(u))
    return !(
      typeof c != 'object' ||
      c === null ||
      ('typ' in c && (c == null ? void 0 : c.typ) !== 'JWT') ||
      !c.alg ||
      (l && c.alg !== l)
    )
  } catch {
    return !1
  }
}
function s1(s, l) {
  return !!(((l === 'v4' || !l) && Ib.test(s)) || ((l === 'v6' || !l) && Fb.test(s)))
}
class kn extends xe {
  _parse(l) {
    if ((this._def.coerce && (l.data = String(l.data)), this._getType(l) !== te.string)) {
      const f = this._getOrReturnCtx(l)
      return (P(f, { code: V.invalid_type, expected: te.string, received: f.parsedType }), fe)
    }
    const u = new gt()
    let c
    for (const f of this._def.checks)
      if (f.kind === 'min')
        l.data.length < f.value &&
          ((c = this._getOrReturnCtx(l, c)),
          P(c, { code: V.too_small, minimum: f.value, type: 'string', inclusive: !0, exact: !1, message: f.message }),
          u.dirty())
      else if (f.kind === 'max')
        l.data.length > f.value &&
          ((c = this._getOrReturnCtx(l, c)),
          P(c, { code: V.too_big, maximum: f.value, type: 'string', inclusive: !0, exact: !1, message: f.message }),
          u.dirty())
      else if (f.kind === 'length') {
        const d = l.data.length > f.value,
          m = l.data.length < f.value
        ;(d || m) &&
          ((c = this._getOrReturnCtx(l, c)),
          d
            ? P(c, { code: V.too_big, maximum: f.value, type: 'string', inclusive: !0, exact: !0, message: f.message })
            : m &&
              P(c, {
                code: V.too_small,
                minimum: f.value,
                type: 'string',
                inclusive: !0,
                exact: !0,
                message: f.message,
              }),
          u.dirty())
      } else if (f.kind === 'email')
        Qb.test(l.data) ||
          ((c = this._getOrReturnCtx(l, c)),
          P(c, { validation: 'email', code: V.invalid_string, message: f.message }),
          u.dirty())
      else if (f.kind === 'emoji')
        (wf || (wf = new RegExp(Xb, 'u')),
          wf.test(l.data) ||
            ((c = this._getOrReturnCtx(l, c)),
            P(c, { validation: 'emoji', code: V.invalid_string, message: f.message }),
            u.dirty()))
      else if (f.kind === 'uuid')
        Vb.test(l.data) ||
          ((c = this._getOrReturnCtx(l, c)),
          P(c, { validation: 'uuid', code: V.invalid_string, message: f.message }),
          u.dirty())
      else if (f.kind === 'nanoid')
        Kb.test(l.data) ||
          ((c = this._getOrReturnCtx(l, c)),
          P(c, { validation: 'nanoid', code: V.invalid_string, message: f.message }),
          u.dirty())
      else if (f.kind === 'cuid')
        Hb.test(l.data) ||
          ((c = this._getOrReturnCtx(l, c)),
          P(c, { validation: 'cuid', code: V.invalid_string, message: f.message }),
          u.dirty())
      else if (f.kind === 'cuid2')
        Yb.test(l.data) ||
          ((c = this._getOrReturnCtx(l, c)),
          P(c, { validation: 'cuid2', code: V.invalid_string, message: f.message }),
          u.dirty())
      else if (f.kind === 'ulid')
        Zb.test(l.data) ||
          ((c = this._getOrReturnCtx(l, c)),
          P(c, { validation: 'ulid', code: V.invalid_string, message: f.message }),
          u.dirty())
      else if (f.kind === 'url')
        try {
          new URL(l.data)
        } catch {
          ;((c = this._getOrReturnCtx(l, c)),
            P(c, { validation: 'url', code: V.invalid_string, message: f.message }),
            u.dirty())
        }
      else
        f.kind === 'regex'
          ? ((f.regex.lastIndex = 0),
            f.regex.test(l.data) ||
              ((c = this._getOrReturnCtx(l, c)),
              P(c, { validation: 'regex', code: V.invalid_string, message: f.message }),
              u.dirty()))
          : f.kind === 'trim'
            ? (l.data = l.data.trim())
            : f.kind === 'includes'
              ? l.data.includes(f.value, f.position) ||
                ((c = this._getOrReturnCtx(l, c)),
                P(c, {
                  code: V.invalid_string,
                  validation: { includes: f.value, position: f.position },
                  message: f.message,
                }),
                u.dirty())
              : f.kind === 'toLowerCase'
                ? (l.data = l.data.toLowerCase())
                : f.kind === 'toUpperCase'
                  ? (l.data = l.data.toUpperCase())
                  : f.kind === 'startsWith'
                    ? l.data.startsWith(f.value) ||
                      ((c = this._getOrReturnCtx(l, c)),
                      P(c, { code: V.invalid_string, validation: { startsWith: f.value }, message: f.message }),
                      u.dirty())
                    : f.kind === 'endsWith'
                      ? l.data.endsWith(f.value) ||
                        ((c = this._getOrReturnCtx(l, c)),
                        P(c, { code: V.invalid_string, validation: { endsWith: f.value }, message: f.message }),
                        u.dirty())
                      : f.kind === 'datetime'
                        ? l1(f).test(l.data) ||
                          ((c = this._getOrReturnCtx(l, c)),
                          P(c, { code: V.invalid_string, validation: 'datetime', message: f.message }),
                          u.dirty())
                        : f.kind === 'date'
                          ? t1.test(l.data) ||
                            ((c = this._getOrReturnCtx(l, c)),
                            P(c, { code: V.invalid_string, validation: 'date', message: f.message }),
                            u.dirty())
                          : f.kind === 'time'
                            ? n1(f).test(l.data) ||
                              ((c = this._getOrReturnCtx(l, c)),
                              P(c, { code: V.invalid_string, validation: 'time', message: f.message }),
                              u.dirty())
                            : f.kind === 'duration'
                              ? $b.test(l.data) ||
                                ((c = this._getOrReturnCtx(l, c)),
                                P(c, { validation: 'duration', code: V.invalid_string, message: f.message }),
                                u.dirty())
                              : f.kind === 'ip'
                                ? a1(l.data, f.version) ||
                                  ((c = this._getOrReturnCtx(l, c)),
                                  P(c, { validation: 'ip', code: V.invalid_string, message: f.message }),
                                  u.dirty())
                                : f.kind === 'jwt'
                                  ? i1(l.data, f.alg) ||
                                    ((c = this._getOrReturnCtx(l, c)),
                                    P(c, { validation: 'jwt', code: V.invalid_string, message: f.message }),
                                    u.dirty())
                                  : f.kind === 'cidr'
                                    ? s1(l.data, f.version) ||
                                      ((c = this._getOrReturnCtx(l, c)),
                                      P(c, { validation: 'cidr', code: V.invalid_string, message: f.message }),
                                      u.dirty())
                                    : f.kind === 'base64'
                                      ? Pb.test(l.data) ||
                                        ((c = this._getOrReturnCtx(l, c)),
                                        P(c, { validation: 'base64', code: V.invalid_string, message: f.message }),
                                        u.dirty())
                                      : f.kind === 'base64url'
                                        ? e1.test(l.data) ||
                                          ((c = this._getOrReturnCtx(l, c)),
                                          P(c, { validation: 'base64url', code: V.invalid_string, message: f.message }),
                                          u.dirty())
                                        : Oe.assertNever(f)
    return { status: u.value, value: l.data }
  }
  _regex(l, a, u) {
    return this.refinement((c) => l.test(c), { validation: a, code: V.invalid_string, ...ae.errToObj(u) })
  }
  _addCheck(l) {
    return new kn({ ...this._def, checks: [...this._def.checks, l] })
  }
  email(l) {
    return this._addCheck({ kind: 'email', ...ae.errToObj(l) })
  }
  url(l) {
    return this._addCheck({ kind: 'url', ...ae.errToObj(l) })
  }
  emoji(l) {
    return this._addCheck({ kind: 'emoji', ...ae.errToObj(l) })
  }
  uuid(l) {
    return this._addCheck({ kind: 'uuid', ...ae.errToObj(l) })
  }
  nanoid(l) {
    return this._addCheck({ kind: 'nanoid', ...ae.errToObj(l) })
  }
  cuid(l) {
    return this._addCheck({ kind: 'cuid', ...ae.errToObj(l) })
  }
  cuid2(l) {
    return this._addCheck({ kind: 'cuid2', ...ae.errToObj(l) })
  }
  ulid(l) {
    return this._addCheck({ kind: 'ulid', ...ae.errToObj(l) })
  }
  base64(l) {
    return this._addCheck({ kind: 'base64', ...ae.errToObj(l) })
  }
  base64url(l) {
    return this._addCheck({ kind: 'base64url', ...ae.errToObj(l) })
  }
  jwt(l) {
    return this._addCheck({ kind: 'jwt', ...ae.errToObj(l) })
  }
  ip(l) {
    return this._addCheck({ kind: 'ip', ...ae.errToObj(l) })
  }
  cidr(l) {
    return this._addCheck({ kind: 'cidr', ...ae.errToObj(l) })
  }
  datetime(l) {
    return typeof l == 'string'
      ? this._addCheck({ kind: 'datetime', precision: null, offset: !1, local: !1, message: l })
      : this._addCheck({
          kind: 'datetime',
          precision: typeof (l == null ? void 0 : l.precision) > 'u' ? null : l == null ? void 0 : l.precision,
          offset: (l == null ? void 0 : l.offset) ?? !1,
          local: (l == null ? void 0 : l.local) ?? !1,
          ...ae.errToObj(l == null ? void 0 : l.message),
        })
  }
  date(l) {
    return this._addCheck({ kind: 'date', message: l })
  }
  time(l) {
    return typeof l == 'string'
      ? this._addCheck({ kind: 'time', precision: null, message: l })
      : this._addCheck({
          kind: 'time',
          precision: typeof (l == null ? void 0 : l.precision) > 'u' ? null : l == null ? void 0 : l.precision,
          ...ae.errToObj(l == null ? void 0 : l.message),
        })
  }
  duration(l) {
    return this._addCheck({ kind: 'duration', ...ae.errToObj(l) })
  }
  regex(l, a) {
    return this._addCheck({ kind: 'regex', regex: l, ...ae.errToObj(a) })
  }
  includes(l, a) {
    return this._addCheck({
      kind: 'includes',
      value: l,
      position: a == null ? void 0 : a.position,
      ...ae.errToObj(a == null ? void 0 : a.message),
    })
  }
  startsWith(l, a) {
    return this._addCheck({ kind: 'startsWith', value: l, ...ae.errToObj(a) })
  }
  endsWith(l, a) {
    return this._addCheck({ kind: 'endsWith', value: l, ...ae.errToObj(a) })
  }
  min(l, a) {
    return this._addCheck({ kind: 'min', value: l, ...ae.errToObj(a) })
  }
  max(l, a) {
    return this._addCheck({ kind: 'max', value: l, ...ae.errToObj(a) })
  }
  length(l, a) {
    return this._addCheck({ kind: 'length', value: l, ...ae.errToObj(a) })
  }
  nonempty(l) {
    return this.min(1, ae.errToObj(l))
  }
  trim() {
    return new kn({ ...this._def, checks: [...this._def.checks, { kind: 'trim' }] })
  }
  toLowerCase() {
    return new kn({ ...this._def, checks: [...this._def.checks, { kind: 'toLowerCase' }] })
  }
  toUpperCase() {
    return new kn({ ...this._def, checks: [...this._def.checks, { kind: 'toUpperCase' }] })
  }
  get isDatetime() {
    return !!this._def.checks.find((l) => l.kind === 'datetime')
  }
  get isDate() {
    return !!this._def.checks.find((l) => l.kind === 'date')
  }
  get isTime() {
    return !!this._def.checks.find((l) => l.kind === 'time')
  }
  get isDuration() {
    return !!this._def.checks.find((l) => l.kind === 'duration')
  }
  get isEmail() {
    return !!this._def.checks.find((l) => l.kind === 'email')
  }
  get isURL() {
    return !!this._def.checks.find((l) => l.kind === 'url')
  }
  get isEmoji() {
    return !!this._def.checks.find((l) => l.kind === 'emoji')
  }
  get isUUID() {
    return !!this._def.checks.find((l) => l.kind === 'uuid')
  }
  get isNANOID() {
    return !!this._def.checks.find((l) => l.kind === 'nanoid')
  }
  get isCUID() {
    return !!this._def.checks.find((l) => l.kind === 'cuid')
  }
  get isCUID2() {
    return !!this._def.checks.find((l) => l.kind === 'cuid2')
  }
  get isULID() {
    return !!this._def.checks.find((l) => l.kind === 'ulid')
  }
  get isIP() {
    return !!this._def.checks.find((l) => l.kind === 'ip')
  }
  get isCIDR() {
    return !!this._def.checks.find((l) => l.kind === 'cidr')
  }
  get isBase64() {
    return !!this._def.checks.find((l) => l.kind === 'base64')
  }
  get isBase64url() {
    return !!this._def.checks.find((l) => l.kind === 'base64url')
  }
  get minLength() {
    let l = null
    for (const a of this._def.checks) a.kind === 'min' && (l === null || a.value > l) && (l = a.value)
    return l
  }
  get maxLength() {
    let l = null
    for (const a of this._def.checks) a.kind === 'max' && (l === null || a.value < l) && (l = a.value)
    return l
  }
}
kn.create = (s) =>
  new kn({ checks: [], typeName: re.ZodString, coerce: (s == null ? void 0 : s.coerce) ?? !1, ...pe(s) })
function u1(s, l) {
  const a = (s.toString().split('.')[1] || '').length,
    u = (l.toString().split('.')[1] || '').length,
    c = a > u ? a : u,
    f = Number.parseInt(s.toFixed(c).replace('.', '')),
    d = Number.parseInt(l.toFixed(c).replace('.', ''))
  return (f % d) / 10 ** c
}
class Ra extends xe {
  constructor() {
    ;(super(...arguments), (this.min = this.gte), (this.max = this.lte), (this.step = this.multipleOf))
  }
  _parse(l) {
    if ((this._def.coerce && (l.data = Number(l.data)), this._getType(l) !== te.number)) {
      const f = this._getOrReturnCtx(l)
      return (P(f, { code: V.invalid_type, expected: te.number, received: f.parsedType }), fe)
    }
    let u
    const c = new gt()
    for (const f of this._def.checks)
      f.kind === 'int'
        ? Oe.isInteger(l.data) ||
          ((u = this._getOrReturnCtx(l, u)),
          P(u, { code: V.invalid_type, expected: 'integer', received: 'float', message: f.message }),
          c.dirty())
        : f.kind === 'min'
          ? (f.inclusive ? l.data < f.value : l.data <= f.value) &&
            ((u = this._getOrReturnCtx(l, u)),
            P(u, {
              code: V.too_small,
              minimum: f.value,
              type: 'number',
              inclusive: f.inclusive,
              exact: !1,
              message: f.message,
            }),
            c.dirty())
          : f.kind === 'max'
            ? (f.inclusive ? l.data > f.value : l.data >= f.value) &&
              ((u = this._getOrReturnCtx(l, u)),
              P(u, {
                code: V.too_big,
                maximum: f.value,
                type: 'number',
                inclusive: f.inclusive,
                exact: !1,
                message: f.message,
              }),
              c.dirty())
            : f.kind === 'multipleOf'
              ? u1(l.data, f.value) !== 0 &&
                ((u = this._getOrReturnCtx(l, u)),
                P(u, { code: V.not_multiple_of, multipleOf: f.value, message: f.message }),
                c.dirty())
              : f.kind === 'finite'
                ? Number.isFinite(l.data) ||
                  ((u = this._getOrReturnCtx(l, u)), P(u, { code: V.not_finite, message: f.message }), c.dirty())
                : Oe.assertNever(f)
    return { status: c.value, value: l.data }
  }
  gte(l, a) {
    return this.setLimit('min', l, !0, ae.toString(a))
  }
  gt(l, a) {
    return this.setLimit('min', l, !1, ae.toString(a))
  }
  lte(l, a) {
    return this.setLimit('max', l, !0, ae.toString(a))
  }
  lt(l, a) {
    return this.setLimit('max', l, !1, ae.toString(a))
  }
  setLimit(l, a, u, c) {
    return new Ra({
      ...this._def,
      checks: [...this._def.checks, { kind: l, value: a, inclusive: u, message: ae.toString(c) }],
    })
  }
  _addCheck(l) {
    return new Ra({ ...this._def, checks: [...this._def.checks, l] })
  }
  int(l) {
    return this._addCheck({ kind: 'int', message: ae.toString(l) })
  }
  positive(l) {
    return this._addCheck({ kind: 'min', value: 0, inclusive: !1, message: ae.toString(l) })
  }
  negative(l) {
    return this._addCheck({ kind: 'max', value: 0, inclusive: !1, message: ae.toString(l) })
  }
  nonpositive(l) {
    return this._addCheck({ kind: 'max', value: 0, inclusive: !0, message: ae.toString(l) })
  }
  nonnegative(l) {
    return this._addCheck({ kind: 'min', value: 0, inclusive: !0, message: ae.toString(l) })
  }
  multipleOf(l, a) {
    return this._addCheck({ kind: 'multipleOf', value: l, message: ae.toString(a) })
  }
  finite(l) {
    return this._addCheck({ kind: 'finite', message: ae.toString(l) })
  }
  safe(l) {
    return this._addCheck({
      kind: 'min',
      inclusive: !0,
      value: Number.MIN_SAFE_INTEGER,
      message: ae.toString(l),
    })._addCheck({ kind: 'max', inclusive: !0, value: Number.MAX_SAFE_INTEGER, message: ae.toString(l) })
  }
  get minValue() {
    let l = null
    for (const a of this._def.checks) a.kind === 'min' && (l === null || a.value > l) && (l = a.value)
    return l
  }
  get maxValue() {
    let l = null
    for (const a of this._def.checks) a.kind === 'max' && (l === null || a.value < l) && (l = a.value)
    return l
  }
  get isInt() {
    return !!this._def.checks.find((l) => l.kind === 'int' || (l.kind === 'multipleOf' && Oe.isInteger(l.value)))
  }
  get isFinite() {
    let l = null,
      a = null
    for (const u of this._def.checks) {
      if (u.kind === 'finite' || u.kind === 'int' || u.kind === 'multipleOf') return !0
      u.kind === 'min'
        ? (a === null || u.value > a) && (a = u.value)
        : u.kind === 'max' && (l === null || u.value < l) && (l = u.value)
    }
    return Number.isFinite(a) && Number.isFinite(l)
  }
}
Ra.create = (s) =>
  new Ra({ checks: [], typeName: re.ZodNumber, coerce: (s == null ? void 0 : s.coerce) || !1, ...pe(s) })
class Xi extends xe {
  constructor() {
    ;(super(...arguments), (this.min = this.gte), (this.max = this.lte))
  }
  _parse(l) {
    if (this._def.coerce)
      try {
        l.data = BigInt(l.data)
      } catch {
        return this._getInvalidInput(l)
      }
    if (this._getType(l) !== te.bigint) return this._getInvalidInput(l)
    let u
    const c = new gt()
    for (const f of this._def.checks)
      f.kind === 'min'
        ? (f.inclusive ? l.data < f.value : l.data <= f.value) &&
          ((u = this._getOrReturnCtx(l, u)),
          P(u, { code: V.too_small, type: 'bigint', minimum: f.value, inclusive: f.inclusive, message: f.message }),
          c.dirty())
        : f.kind === 'max'
          ? (f.inclusive ? l.data > f.value : l.data >= f.value) &&
            ((u = this._getOrReturnCtx(l, u)),
            P(u, { code: V.too_big, type: 'bigint', maximum: f.value, inclusive: f.inclusive, message: f.message }),
            c.dirty())
          : f.kind === 'multipleOf'
            ? l.data % f.value !== BigInt(0) &&
              ((u = this._getOrReturnCtx(l, u)),
              P(u, { code: V.not_multiple_of, multipleOf: f.value, message: f.message }),
              c.dirty())
            : Oe.assertNever(f)
    return { status: c.value, value: l.data }
  }
  _getInvalidInput(l) {
    const a = this._getOrReturnCtx(l)
    return (P(a, { code: V.invalid_type, expected: te.bigint, received: a.parsedType }), fe)
  }
  gte(l, a) {
    return this.setLimit('min', l, !0, ae.toString(a))
  }
  gt(l, a) {
    return this.setLimit('min', l, !1, ae.toString(a))
  }
  lte(l, a) {
    return this.setLimit('max', l, !0, ae.toString(a))
  }
  lt(l, a) {
    return this.setLimit('max', l, !1, ae.toString(a))
  }
  setLimit(l, a, u, c) {
    return new Xi({
      ...this._def,
      checks: [...this._def.checks, { kind: l, value: a, inclusive: u, message: ae.toString(c) }],
    })
  }
  _addCheck(l) {
    return new Xi({ ...this._def, checks: [...this._def.checks, l] })
  }
  positive(l) {
    return this._addCheck({ kind: 'min', value: BigInt(0), inclusive: !1, message: ae.toString(l) })
  }
  negative(l) {
    return this._addCheck({ kind: 'max', value: BigInt(0), inclusive: !1, message: ae.toString(l) })
  }
  nonpositive(l) {
    return this._addCheck({ kind: 'max', value: BigInt(0), inclusive: !0, message: ae.toString(l) })
  }
  nonnegative(l) {
    return this._addCheck({ kind: 'min', value: BigInt(0), inclusive: !0, message: ae.toString(l) })
  }
  multipleOf(l, a) {
    return this._addCheck({ kind: 'multipleOf', value: l, message: ae.toString(a) })
  }
  get minValue() {
    let l = null
    for (const a of this._def.checks) a.kind === 'min' && (l === null || a.value > l) && (l = a.value)
    return l
  }
  get maxValue() {
    let l = null
    for (const a of this._def.checks) a.kind === 'max' && (l === null || a.value < l) && (l = a.value)
    return l
  }
}
Xi.create = (s) =>
  new Xi({ checks: [], typeName: re.ZodBigInt, coerce: (s == null ? void 0 : s.coerce) ?? !1, ...pe(s) })
class Yf extends xe {
  _parse(l) {
    if ((this._def.coerce && (l.data = !!l.data), this._getType(l) !== te.boolean)) {
      const u = this._getOrReturnCtx(l)
      return (P(u, { code: V.invalid_type, expected: te.boolean, received: u.parsedType }), fe)
    }
    return Wt(l.data)
  }
}
Yf.create = (s) => new Yf({ typeName: re.ZodBoolean, coerce: (s == null ? void 0 : s.coerce) || !1, ...pe(s) })
class Cu extends xe {
  _parse(l) {
    if ((this._def.coerce && (l.data = new Date(l.data)), this._getType(l) !== te.date)) {
      const f = this._getOrReturnCtx(l)
      return (P(f, { code: V.invalid_type, expected: te.date, received: f.parsedType }), fe)
    }
    if (Number.isNaN(l.data.getTime())) {
      const f = this._getOrReturnCtx(l)
      return (P(f, { code: V.invalid_date }), fe)
    }
    const u = new gt()
    let c
    for (const f of this._def.checks)
      f.kind === 'min'
        ? l.data.getTime() < f.value &&
          ((c = this._getOrReturnCtx(l, c)),
          P(c, { code: V.too_small, message: f.message, inclusive: !0, exact: !1, minimum: f.value, type: 'date' }),
          u.dirty())
        : f.kind === 'max'
          ? l.data.getTime() > f.value &&
            ((c = this._getOrReturnCtx(l, c)),
            P(c, { code: V.too_big, message: f.message, inclusive: !0, exact: !1, maximum: f.value, type: 'date' }),
            u.dirty())
          : Oe.assertNever(f)
    return { status: u.value, value: new Date(l.data.getTime()) }
  }
  _addCheck(l) {
    return new Cu({ ...this._def, checks: [...this._def.checks, l] })
  }
  min(l, a) {
    return this._addCheck({ kind: 'min', value: l.getTime(), message: ae.toString(a) })
  }
  max(l, a) {
    return this._addCheck({ kind: 'max', value: l.getTime(), message: ae.toString(a) })
  }
  get minDate() {
    let l = null
    for (const a of this._def.checks) a.kind === 'min' && (l === null || a.value > l) && (l = a.value)
    return l != null ? new Date(l) : null
  }
  get maxDate() {
    let l = null
    for (const a of this._def.checks) a.kind === 'max' && (l === null || a.value < l) && (l = a.value)
    return l != null ? new Date(l) : null
  }
}
Cu.create = (s) => new Cu({ checks: [], coerce: (s == null ? void 0 : s.coerce) || !1, typeName: re.ZodDate, ...pe(s) })
class Yy extends xe {
  _parse(l) {
    if (this._getType(l) !== te.symbol) {
      const u = this._getOrReturnCtx(l)
      return (P(u, { code: V.invalid_type, expected: te.symbol, received: u.parsedType }), fe)
    }
    return Wt(l.data)
  }
}
Yy.create = (s) => new Yy({ typeName: re.ZodSymbol, ...pe(s) })
class Zy extends xe {
  _parse(l) {
    if (this._getType(l) !== te.undefined) {
      const u = this._getOrReturnCtx(l)
      return (P(u, { code: V.invalid_type, expected: te.undefined, received: u.parsedType }), fe)
    }
    return Wt(l.data)
  }
}
Zy.create = (s) => new Zy({ typeName: re.ZodUndefined, ...pe(s) })
class Vy extends xe {
  _parse(l) {
    if (this._getType(l) !== te.null) {
      const u = this._getOrReturnCtx(l)
      return (P(u, { code: V.invalid_type, expected: te.null, received: u.parsedType }), fe)
    }
    return Wt(l.data)
  }
}
Vy.create = (s) => new Vy({ typeName: re.ZodNull, ...pe(s) })
class Ky extends xe {
  constructor() {
    ;(super(...arguments), (this._any = !0))
  }
  _parse(l) {
    return Wt(l.data)
  }
}
Ky.create = (s) => new Ky({ typeName: re.ZodAny, ...pe(s) })
class Zf extends xe {
  constructor() {
    ;(super(...arguments), (this._unknown = !0))
  }
  _parse(l) {
    return Wt(l.data)
  }
}
Zf.create = (s) => new Zf({ typeName: re.ZodUnknown, ...pe(s) })
class fl extends xe {
  _parse(l) {
    const a = this._getOrReturnCtx(l)
    return (P(a, { code: V.invalid_type, expected: te.never, received: a.parsedType }), fe)
  }
}
fl.create = (s) => new fl({ typeName: re.ZodNever, ...pe(s) })
class Gy extends xe {
  _parse(l) {
    if (this._getType(l) !== te.undefined) {
      const u = this._getOrReturnCtx(l)
      return (P(u, { code: V.invalid_type, expected: te.void, received: u.parsedType }), fe)
    }
    return Wt(l.data)
  }
}
Gy.create = (s) => new Gy({ typeName: re.ZodVoid, ...pe(s) })
class cn extends xe {
  _parse(l) {
    const { ctx: a, status: u } = this._processInputParams(l),
      c = this._def
    if (a.parsedType !== te.array)
      return (P(a, { code: V.invalid_type, expected: te.array, received: a.parsedType }), fe)
    if (c.exactLength !== null) {
      const d = a.data.length > c.exactLength.value,
        m = a.data.length < c.exactLength.value
      ;(d || m) &&
        (P(a, {
          code: d ? V.too_big : V.too_small,
          minimum: m ? c.exactLength.value : void 0,
          maximum: d ? c.exactLength.value : void 0,
          type: 'array',
          inclusive: !0,
          exact: !0,
          message: c.exactLength.message,
        }),
        u.dirty())
    }
    if (
      (c.minLength !== null &&
        a.data.length < c.minLength.value &&
        (P(a, {
          code: V.too_small,
          minimum: c.minLength.value,
          type: 'array',
          inclusive: !0,
          exact: !1,
          message: c.minLength.message,
        }),
        u.dirty()),
      c.maxLength !== null &&
        a.data.length > c.maxLength.value &&
        (P(a, {
          code: V.too_big,
          maximum: c.maxLength.value,
          type: 'array',
          inclusive: !0,
          exact: !1,
          message: c.maxLength.message,
        }),
        u.dirty()),
      a.common.async)
    )
      return Promise.all([...a.data].map((d, m) => c.type._parseAsync(new fn(a, d, a.path, m)))).then((d) =>
        gt.mergeArray(u, d)
      )
    const f = [...a.data].map((d, m) => c.type._parseSync(new fn(a, d, a.path, m)))
    return gt.mergeArray(u, f)
  }
  get element() {
    return this._def.type
  }
  min(l, a) {
    return new cn({ ...this._def, minLength: { value: l, message: ae.toString(a) } })
  }
  max(l, a) {
    return new cn({ ...this._def, maxLength: { value: l, message: ae.toString(a) } })
  }
  length(l, a) {
    return new cn({ ...this._def, exactLength: { value: l, message: ae.toString(a) } })
  }
  nonempty(l) {
    return this.min(1, l)
  }
}
cn.create = (s, l) =>
  new cn({ type: s, minLength: null, maxLength: null, exactLength: null, typeName: re.ZodArray, ...pe(l) })
function Oa(s) {
  if (s instanceof nt) {
    const l = {}
    for (const a in s.shape) {
      const u = s.shape[a]
      l[a] = ul.create(Oa(u))
    }
    return new nt({ ...s._def, shape: () => l })
  } else
    return s instanceof cn
      ? new cn({ ...s._def, type: Oa(s.element) })
      : s instanceof ul
        ? ul.create(Oa(s.unwrap()))
        : s instanceof qa
          ? qa.create(Oa(s.unwrap()))
          : s instanceof Rl
            ? Rl.create(s.items.map((l) => Oa(l)))
            : s
}
class nt extends xe {
  constructor() {
    ;(super(...arguments), (this._cached = null), (this.nonstrict = this.passthrough), (this.augment = this.extend))
  }
  _getCached() {
    if (this._cached !== null) return this._cached
    const l = this._def.shape(),
      a = Oe.objectKeys(l)
    return ((this._cached = { shape: l, keys: a }), this._cached)
  }
  _parse(l) {
    if (this._getType(l) !== te.object) {
      const p = this._getOrReturnCtx(l)
      return (P(p, { code: V.invalid_type, expected: te.object, received: p.parsedType }), fe)
    }
    const { status: u, ctx: c } = this._processInputParams(l),
      { shape: f, keys: d } = this._getCached(),
      m = []
    if (!(this._def.catchall instanceof fl && this._def.unknownKeys === 'strip'))
      for (const p in c.data) d.includes(p) || m.push(p)
    const g = []
    for (const p of d) {
      const _ = f[p],
        S = c.data[p]
      g.push({ key: { status: 'valid', value: p }, value: _._parse(new fn(c, S, c.path, p)), alwaysSet: p in c.data })
    }
    if (this._def.catchall instanceof fl) {
      const p = this._def.unknownKeys
      if (p === 'passthrough')
        for (const _ of m) g.push({ key: { status: 'valid', value: _ }, value: { status: 'valid', value: c.data[_] } })
      else if (p === 'strict') m.length > 0 && (P(c, { code: V.unrecognized_keys, keys: m }), u.dirty())
      else if (p !== 'strip') throw new Error('Internal ZodObject error: invalid unknownKeys value.')
    } else {
      const p = this._def.catchall
      for (const _ of m) {
        const S = c.data[_]
        g.push({ key: { status: 'valid', value: _ }, value: p._parse(new fn(c, S, c.path, _)), alwaysSet: _ in c.data })
      }
    }
    return c.common.async
      ? Promise.resolve()
          .then(async () => {
            const p = []
            for (const _ of g) {
              const S = await _.key,
                O = await _.value
              p.push({ key: S, value: O, alwaysSet: _.alwaysSet })
            }
            return p
          })
          .then((p) => gt.mergeObjectSync(u, p))
      : gt.mergeObjectSync(u, g)
  }
  get shape() {
    return this._def.shape()
  }
  strict(l) {
    return (
      ae.errToObj,
      new nt({
        ...this._def,
        unknownKeys: 'strict',
        ...(l !== void 0
          ? {
              errorMap: (a, u) => {
                var f, d
                const c = ((d = (f = this._def).errorMap) == null ? void 0 : d.call(f, a, u).message) ?? u.defaultError
                return a.code === 'unrecognized_keys' ? { message: ae.errToObj(l).message ?? c } : { message: c }
              },
            }
          : {}),
      })
    )
  }
  strip() {
    return new nt({ ...this._def, unknownKeys: 'strip' })
  }
  passthrough() {
    return new nt({ ...this._def, unknownKeys: 'passthrough' })
  }
  extend(l) {
    return new nt({ ...this._def, shape: () => ({ ...this._def.shape(), ...l }) })
  }
  merge(l) {
    return new nt({
      unknownKeys: l._def.unknownKeys,
      catchall: l._def.catchall,
      shape: () => ({ ...this._def.shape(), ...l._def.shape() }),
      typeName: re.ZodObject,
    })
  }
  setKey(l, a) {
    return this.augment({ [l]: a })
  }
  catchall(l) {
    return new nt({ ...this._def, catchall: l })
  }
  pick(l) {
    const a = {}
    for (const u of Oe.objectKeys(l)) l[u] && this.shape[u] && (a[u] = this.shape[u])
    return new nt({ ...this._def, shape: () => a })
  }
  omit(l) {
    const a = {}
    for (const u of Oe.objectKeys(this.shape)) l[u] || (a[u] = this.shape[u])
    return new nt({ ...this._def, shape: () => a })
  }
  deepPartial() {
    return Oa(this)
  }
  partial(l) {
    const a = {}
    for (const u of Oe.objectKeys(this.shape)) {
      const c = this.shape[u]
      l && !l[u] ? (a[u] = c) : (a[u] = c.optional())
    }
    return new nt({ ...this._def, shape: () => a })
  }
  required(l) {
    const a = {}
    for (const u of Oe.objectKeys(this.shape))
      if (l && !l[u]) a[u] = this.shape[u]
      else {
        let f = this.shape[u]
        for (; f instanceof ul; ) f = f._def.innerType
        a[u] = f
      }
    return new nt({ ...this._def, shape: () => a })
  }
  keyof() {
    return yp(Oe.objectKeys(this.shape))
  }
}
nt.create = (s, l) =>
  new nt({ shape: () => s, unknownKeys: 'strip', catchall: fl.create(), typeName: re.ZodObject, ...pe(l) })
nt.strictCreate = (s, l) =>
  new nt({ shape: () => s, unknownKeys: 'strict', catchall: fl.create(), typeName: re.ZodObject, ...pe(l) })
nt.lazycreate = (s, l) =>
  new nt({ shape: s, unknownKeys: 'strip', catchall: fl.create(), typeName: re.ZodObject, ...pe(l) })
class Mu extends xe {
  _parse(l) {
    const { ctx: a } = this._processInputParams(l),
      u = this._def.options
    function c(f) {
      for (const m of f) if (m.result.status === 'valid') return m.result
      for (const m of f)
        if (m.result.status === 'dirty') return (a.common.issues.push(...m.ctx.common.issues), m.result)
      const d = f.map((m) => new Dn(m.ctx.common.issues))
      return (P(a, { code: V.invalid_union, unionErrors: d }), fe)
    }
    if (a.common.async)
      return Promise.all(
        u.map(async (f) => {
          const d = { ...a, common: { ...a.common, issues: [] }, parent: null }
          return { result: await f._parseAsync({ data: a.data, path: a.path, parent: d }), ctx: d }
        })
      ).then(c)
    {
      let f
      const d = []
      for (const g of u) {
        const p = { ...a, common: { ...a.common, issues: [] }, parent: null },
          _ = g._parseSync({ data: a.data, path: a.path, parent: p })
        if (_.status === 'valid') return _
        ;(_.status === 'dirty' && !f && (f = { result: _, ctx: p }), p.common.issues.length && d.push(p.common.issues))
      }
      if (f) return (a.common.issues.push(...f.ctx.common.issues), f.result)
      const m = d.map((g) => new Dn(g))
      return (P(a, { code: V.invalid_union, unionErrors: m }), fe)
    }
  }
  get options() {
    return this._def.options
  }
}
Mu.create = (s, l) => new Mu({ options: s, typeName: re.ZodUnion, ...pe(l) })
function Vf(s, l) {
  const a = il(s),
    u = il(l)
  if (s === l) return { valid: !0, data: s }
  if (a === te.object && u === te.object) {
    const c = Oe.objectKeys(l),
      f = Oe.objectKeys(s).filter((m) => c.indexOf(m) !== -1),
      d = { ...s, ...l }
    for (const m of f) {
      const g = Vf(s[m], l[m])
      if (!g.valid) return { valid: !1 }
      d[m] = g.data
    }
    return { valid: !0, data: d }
  } else if (a === te.array && u === te.array) {
    if (s.length !== l.length) return { valid: !1 }
    const c = []
    for (let f = 0; f < s.length; f++) {
      const d = s[f],
        m = l[f],
        g = Vf(d, m)
      if (!g.valid) return { valid: !1 }
      c.push(g.data)
    }
    return { valid: !0, data: c }
  } else return a === te.date && u === te.date && +s == +l ? { valid: !0, data: s } : { valid: !1 }
}
class Du extends xe {
  _parse(l) {
    const { status: a, ctx: u } = this._processInputParams(l),
      c = (f, d) => {
        if (By(f) || By(d)) return fe
        const m = Vf(f.value, d.value)
        return m.valid
          ? ((qy(f) || qy(d)) && a.dirty(), { status: a.value, value: m.data })
          : (P(u, { code: V.invalid_intersection_types }), fe)
      }
    return u.common.async
      ? Promise.all([
          this._def.left._parseAsync({ data: u.data, path: u.path, parent: u }),
          this._def.right._parseAsync({ data: u.data, path: u.path, parent: u }),
        ]).then(([f, d]) => c(f, d))
      : c(
          this._def.left._parseSync({ data: u.data, path: u.path, parent: u }),
          this._def.right._parseSync({ data: u.data, path: u.path, parent: u })
        )
  }
}
Du.create = (s, l, a) => new Du({ left: s, right: l, typeName: re.ZodIntersection, ...pe(a) })
class Rl extends xe {
  _parse(l) {
    const { status: a, ctx: u } = this._processInputParams(l)
    if (u.parsedType !== te.array)
      return (P(u, { code: V.invalid_type, expected: te.array, received: u.parsedType }), fe)
    if (u.data.length < this._def.items.length)
      return (P(u, { code: V.too_small, minimum: this._def.items.length, inclusive: !0, exact: !1, type: 'array' }), fe)
    !this._def.rest &&
      u.data.length > this._def.items.length &&
      (P(u, { code: V.too_big, maximum: this._def.items.length, inclusive: !0, exact: !1, type: 'array' }), a.dirty())
    const f = [...u.data]
      .map((d, m) => {
        const g = this._def.items[m] || this._def.rest
        return g ? g._parse(new fn(u, d, u.path, m)) : null
      })
      .filter((d) => !!d)
    return u.common.async ? Promise.all(f).then((d) => gt.mergeArray(a, d)) : gt.mergeArray(a, f)
  }
  get items() {
    return this._def.items
  }
  rest(l) {
    return new Rl({ ...this._def, rest: l })
  }
}
Rl.create = (s, l) => {
  if (!Array.isArray(s)) throw new Error('You must pass an array of schemas to z.tuple([ ... ])')
  return new Rl({ items: s, typeName: re.ZodTuple, rest: null, ...pe(l) })
}
class zu extends xe {
  get keySchema() {
    return this._def.keyType
  }
  get valueSchema() {
    return this._def.valueType
  }
  _parse(l) {
    const { status: a, ctx: u } = this._processInputParams(l)
    if (u.parsedType !== te.object)
      return (P(u, { code: V.invalid_type, expected: te.object, received: u.parsedType }), fe)
    const c = [],
      f = this._def.keyType,
      d = this._def.valueType
    for (const m in u.data)
      c.push({
        key: f._parse(new fn(u, m, u.path, m)),
        value: d._parse(new fn(u, u.data[m], u.path, m)),
        alwaysSet: m in u.data,
      })
    return u.common.async ? gt.mergeObjectAsync(a, c) : gt.mergeObjectSync(a, c)
  }
  get element() {
    return this._def.valueType
  }
  static create(l, a, u) {
    return a instanceof xe
      ? new zu({ keyType: l, valueType: a, typeName: re.ZodRecord, ...pe(u) })
      : new zu({ keyType: kn.create(), valueType: l, typeName: re.ZodRecord, ...pe(a) })
  }
}
class $y extends xe {
  get keySchema() {
    return this._def.keyType
  }
  get valueSchema() {
    return this._def.valueType
  }
  _parse(l) {
    const { status: a, ctx: u } = this._processInputParams(l)
    if (u.parsedType !== te.map) return (P(u, { code: V.invalid_type, expected: te.map, received: u.parsedType }), fe)
    const c = this._def.keyType,
      f = this._def.valueType,
      d = [...u.data.entries()].map(([m, g], p) => ({
        key: c._parse(new fn(u, m, u.path, [p, 'key'])),
        value: f._parse(new fn(u, g, u.path, [p, 'value'])),
      }))
    if (u.common.async) {
      const m = new Map()
      return Promise.resolve().then(async () => {
        for (const g of d) {
          const p = await g.key,
            _ = await g.value
          if (p.status === 'aborted' || _.status === 'aborted') return fe
          ;((p.status === 'dirty' || _.status === 'dirty') && a.dirty(), m.set(p.value, _.value))
        }
        return { status: a.value, value: m }
      })
    } else {
      const m = new Map()
      for (const g of d) {
        const p = g.key,
          _ = g.value
        if (p.status === 'aborted' || _.status === 'aborted') return fe
        ;((p.status === 'dirty' || _.status === 'dirty') && a.dirty(), m.set(p.value, _.value))
      }
      return { status: a.value, value: m }
    }
  }
}
$y.create = (s, l, a) => new $y({ valueType: l, keyType: s, typeName: re.ZodMap, ...pe(a) })
class Ji extends xe {
  _parse(l) {
    const { status: a, ctx: u } = this._processInputParams(l)
    if (u.parsedType !== te.set) return (P(u, { code: V.invalid_type, expected: te.set, received: u.parsedType }), fe)
    const c = this._def
    ;(c.minSize !== null &&
      u.data.size < c.minSize.value &&
      (P(u, {
        code: V.too_small,
        minimum: c.minSize.value,
        type: 'set',
        inclusive: !0,
        exact: !1,
        message: c.minSize.message,
      }),
      a.dirty()),
      c.maxSize !== null &&
        u.data.size > c.maxSize.value &&
        (P(u, {
          code: V.too_big,
          maximum: c.maxSize.value,
          type: 'set',
          inclusive: !0,
          exact: !1,
          message: c.maxSize.message,
        }),
        a.dirty()))
    const f = this._def.valueType
    function d(g) {
      const p = new Set()
      for (const _ of g) {
        if (_.status === 'aborted') return fe
        ;(_.status === 'dirty' && a.dirty(), p.add(_.value))
      }
      return { status: a.value, value: p }
    }
    const m = [...u.data.values()].map((g, p) => f._parse(new fn(u, g, u.path, p)))
    return u.common.async ? Promise.all(m).then((g) => d(g)) : d(m)
  }
  min(l, a) {
    return new Ji({ ...this._def, minSize: { value: l, message: ae.toString(a) } })
  }
  max(l, a) {
    return new Ji({ ...this._def, maxSize: { value: l, message: ae.toString(a) } })
  }
  size(l, a) {
    return this.min(l, a).max(l, a)
  }
  nonempty(l) {
    return this.min(1, l)
  }
}
Ji.create = (s, l) => new Ji({ valueType: s, minSize: null, maxSize: null, typeName: re.ZodSet, ...pe(l) })
class Qy extends xe {
  get schema() {
    return this._def.getter()
  }
  _parse(l) {
    const { ctx: a } = this._processInputParams(l)
    return this._def.getter()._parse({ data: a.data, path: a.path, parent: a })
  }
}
Qy.create = (s, l) => new Qy({ getter: s, typeName: re.ZodLazy, ...pe(l) })
class Xy extends xe {
  _parse(l) {
    if (l.data !== this._def.value) {
      const a = this._getOrReturnCtx(l)
      return (P(a, { received: a.data, code: V.invalid_literal, expected: this._def.value }), fe)
    }
    return { status: 'valid', value: l.data }
  }
  get value() {
    return this._def.value
  }
}
Xy.create = (s, l) => new Xy({ value: s, typeName: re.ZodLiteral, ...pe(l) })
function yp(s, l) {
  return new Ua({ values: s, typeName: re.ZodEnum, ...pe(l) })
}
class Ua extends xe {
  _parse(l) {
    if (typeof l.data != 'string') {
      const a = this._getOrReturnCtx(l),
        u = this._def.values
      return (P(a, { expected: Oe.joinValues(u), received: a.parsedType, code: V.invalid_type }), fe)
    }
    if ((this._cache || (this._cache = new Set(this._def.values)), !this._cache.has(l.data))) {
      const a = this._getOrReturnCtx(l),
        u = this._def.values
      return (P(a, { received: a.data, code: V.invalid_enum_value, options: u }), fe)
    }
    return Wt(l.data)
  }
  get options() {
    return this._def.values
  }
  get enum() {
    const l = {}
    for (const a of this._def.values) l[a] = a
    return l
  }
  get Values() {
    const l = {}
    for (const a of this._def.values) l[a] = a
    return l
  }
  get Enum() {
    const l = {}
    for (const a of this._def.values) l[a] = a
    return l
  }
  extract(l, a = this._def) {
    return Ua.create(l, { ...this._def, ...a })
  }
  exclude(l, a = this._def) {
    return Ua.create(
      this.options.filter((u) => !l.includes(u)),
      { ...this._def, ...a }
    )
  }
}
Ua.create = yp
class Jy extends xe {
  _parse(l) {
    const a = Oe.getValidEnumValues(this._def.values),
      u = this._getOrReturnCtx(l)
    if (u.parsedType !== te.string && u.parsedType !== te.number) {
      const c = Oe.objectValues(a)
      return (P(u, { expected: Oe.joinValues(c), received: u.parsedType, code: V.invalid_type }), fe)
    }
    if ((this._cache || (this._cache = new Set(Oe.getValidEnumValues(this._def.values))), !this._cache.has(l.data))) {
      const c = Oe.objectValues(a)
      return (P(u, { received: u.data, code: V.invalid_enum_value, options: c }), fe)
    }
    return Wt(l.data)
  }
  get enum() {
    return this._def.values
  }
}
Jy.create = (s, l) => new Jy({ values: s, typeName: re.ZodNativeEnum, ...pe(l) })
class Lu extends xe {
  unwrap() {
    return this._def.type
  }
  _parse(l) {
    const { ctx: a } = this._processInputParams(l)
    if (a.parsedType !== te.promise && a.common.async === !1)
      return (P(a, { code: V.invalid_type, expected: te.promise, received: a.parsedType }), fe)
    const u = a.parsedType === te.promise ? a.data : Promise.resolve(a.data)
    return Wt(u.then((c) => this._def.type.parseAsync(c, { path: a.path, errorMap: a.common.contextualErrorMap })))
  }
}
Lu.create = (s, l) => new Lu({ type: s, typeName: re.ZodPromise, ...pe(l) })
class Ba extends xe {
  innerType() {
    return this._def.schema
  }
  sourceType() {
    return this._def.schema._def.typeName === re.ZodEffects ? this._def.schema.sourceType() : this._def.schema
  }
  _parse(l) {
    const { status: a, ctx: u } = this._processInputParams(l),
      c = this._def.effect || null,
      f = {
        addIssue: (d) => {
          ;(P(u, d), d.fatal ? a.abort() : a.dirty())
        },
        get path() {
          return u.path
        },
      }
    if (((f.addIssue = f.addIssue.bind(f)), c.type === 'preprocess')) {
      const d = c.transform(u.data, f)
      if (u.common.async)
        return Promise.resolve(d).then(async (m) => {
          if (a.value === 'aborted') return fe
          const g = await this._def.schema._parseAsync({ data: m, path: u.path, parent: u })
          return g.status === 'aborted' ? fe : g.status === 'dirty' || a.value === 'dirty' ? Ki(g.value) : g
        })
      {
        if (a.value === 'aborted') return fe
        const m = this._def.schema._parseSync({ data: d, path: u.path, parent: u })
        return m.status === 'aborted' ? fe : m.status === 'dirty' || a.value === 'dirty' ? Ki(m.value) : m
      }
    }
    if (c.type === 'refinement') {
      const d = (m) => {
        const g = c.refinement(m, f)
        if (u.common.async) return Promise.resolve(g)
        if (g instanceof Promise)
          throw new Error('Async refinement encountered during synchronous parse operation. Use .parseAsync instead.')
        return m
      }
      if (u.common.async === !1) {
        const m = this._def.schema._parseSync({ data: u.data, path: u.path, parent: u })
        return m.status === 'aborted'
          ? fe
          : (m.status === 'dirty' && a.dirty(), d(m.value), { status: a.value, value: m.value })
      } else
        return this._def.schema
          ._parseAsync({ data: u.data, path: u.path, parent: u })
          .then((m) =>
            m.status === 'aborted'
              ? fe
              : (m.status === 'dirty' && a.dirty(), d(m.value).then(() => ({ status: a.value, value: m.value })))
          )
    }
    if (c.type === 'transform')
      if (u.common.async === !1) {
        const d = this._def.schema._parseSync({ data: u.data, path: u.path, parent: u })
        if (!La(d)) return fe
        const m = c.transform(d.value, f)
        if (m instanceof Promise)
          throw new Error(
            'Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.'
          )
        return { status: a.value, value: m }
      } else
        return this._def.schema
          ._parseAsync({ data: u.data, path: u.path, parent: u })
          .then((d) =>
            La(d) ? Promise.resolve(c.transform(d.value, f)).then((m) => ({ status: a.value, value: m })) : fe
          )
    Oe.assertNever(c)
  }
}
Ba.create = (s, l, a) => new Ba({ schema: s, typeName: re.ZodEffects, effect: l, ...pe(a) })
Ba.createWithPreprocess = (s, l, a) =>
  new Ba({ schema: l, effect: { type: 'preprocess', transform: s }, typeName: re.ZodEffects, ...pe(a) })
class ul extends xe {
  _parse(l) {
    return this._getType(l) === te.undefined ? Wt(void 0) : this._def.innerType._parse(l)
  }
  unwrap() {
    return this._def.innerType
  }
}
ul.create = (s, l) => new ul({ innerType: s, typeName: re.ZodOptional, ...pe(l) })
class qa extends xe {
  _parse(l) {
    return this._getType(l) === te.null ? Wt(null) : this._def.innerType._parse(l)
  }
  unwrap() {
    return this._def.innerType
  }
}
qa.create = (s, l) => new qa({ innerType: s, typeName: re.ZodNullable, ...pe(l) })
class Kf extends xe {
  _parse(l) {
    const { ctx: a } = this._processInputParams(l)
    let u = a.data
    return (
      a.parsedType === te.undefined && (u = this._def.defaultValue()),
      this._def.innerType._parse({ data: u, path: a.path, parent: a })
    )
  }
  removeDefault() {
    return this._def.innerType
  }
}
Kf.create = (s, l) =>
  new Kf({
    innerType: s,
    typeName: re.ZodDefault,
    defaultValue: typeof l.default == 'function' ? l.default : () => l.default,
    ...pe(l),
  })
class Gf extends xe {
  _parse(l) {
    const { ctx: a } = this._processInputParams(l),
      u = { ...a, common: { ...a.common, issues: [] } },
      c = this._def.innerType._parse({ data: u.data, path: u.path, parent: { ...u } })
    return ku(c)
      ? c.then((f) => ({
          status: 'valid',
          value:
            f.status === 'valid'
              ? f.value
              : this._def.catchValue({
                  get error() {
                    return new Dn(u.common.issues)
                  },
                  input: u.data,
                }),
        }))
      : {
          status: 'valid',
          value:
            c.status === 'valid'
              ? c.value
              : this._def.catchValue({
                  get error() {
                    return new Dn(u.common.issues)
                  },
                  input: u.data,
                }),
        }
  }
  removeCatch() {
    return this._def.innerType
  }
}
Gf.create = (s, l) =>
  new Gf({
    innerType: s,
    typeName: re.ZodCatch,
    catchValue: typeof l.catch == 'function' ? l.catch : () => l.catch,
    ...pe(l),
  })
class Iy extends xe {
  _parse(l) {
    if (this._getType(l) !== te.nan) {
      const u = this._getOrReturnCtx(l)
      return (P(u, { code: V.invalid_type, expected: te.nan, received: u.parsedType }), fe)
    }
    return { status: 'valid', value: l.data }
  }
}
Iy.create = (s) => new Iy({ typeName: re.ZodNaN, ...pe(s) })
class c1 extends xe {
  _parse(l) {
    const { ctx: a } = this._processInputParams(l),
      u = a.data
    return this._def.type._parse({ data: u, path: a.path, parent: a })
  }
  unwrap() {
    return this._def.type
  }
}
class io extends xe {
  _parse(l) {
    const { status: a, ctx: u } = this._processInputParams(l)
    if (u.common.async)
      return (async () => {
        const f = await this._def.in._parseAsync({ data: u.data, path: u.path, parent: u })
        return f.status === 'aborted'
          ? fe
          : f.status === 'dirty'
            ? (a.dirty(), Ki(f.value))
            : this._def.out._parseAsync({ data: f.value, path: u.path, parent: u })
      })()
    {
      const c = this._def.in._parseSync({ data: u.data, path: u.path, parent: u })
      return c.status === 'aborted'
        ? fe
        : c.status === 'dirty'
          ? (a.dirty(), { status: 'dirty', value: c.value })
          : this._def.out._parseSync({ data: c.value, path: u.path, parent: u })
    }
  }
  static create(l, a) {
    return new io({ in: l, out: a, typeName: re.ZodPipeline })
  }
}
class $f extends xe {
  _parse(l) {
    const a = this._def.innerType._parse(l),
      u = (c) => (La(c) && (c.value = Object.freeze(c.value)), c)
    return ku(a) ? a.then((c) => u(c)) : u(a)
  }
  unwrap() {
    return this._def.innerType
  }
}
$f.create = (s, l) => new $f({ innerType: s, typeName: re.ZodReadonly, ...pe(l) })
var re
;(function (s) {
  ;((s.ZodString = 'ZodString'),
    (s.ZodNumber = 'ZodNumber'),
    (s.ZodNaN = 'ZodNaN'),
    (s.ZodBigInt = 'ZodBigInt'),
    (s.ZodBoolean = 'ZodBoolean'),
    (s.ZodDate = 'ZodDate'),
    (s.ZodSymbol = 'ZodSymbol'),
    (s.ZodUndefined = 'ZodUndefined'),
    (s.ZodNull = 'ZodNull'),
    (s.ZodAny = 'ZodAny'),
    (s.ZodUnknown = 'ZodUnknown'),
    (s.ZodNever = 'ZodNever'),
    (s.ZodVoid = 'ZodVoid'),
    (s.ZodArray = 'ZodArray'),
    (s.ZodObject = 'ZodObject'),
    (s.ZodUnion = 'ZodUnion'),
    (s.ZodDiscriminatedUnion = 'ZodDiscriminatedUnion'),
    (s.ZodIntersection = 'ZodIntersection'),
    (s.ZodTuple = 'ZodTuple'),
    (s.ZodRecord = 'ZodRecord'),
    (s.ZodMap = 'ZodMap'),
    (s.ZodSet = 'ZodSet'),
    (s.ZodFunction = 'ZodFunction'),
    (s.ZodLazy = 'ZodLazy'),
    (s.ZodLiteral = 'ZodLiteral'),
    (s.ZodEnum = 'ZodEnum'),
    (s.ZodEffects = 'ZodEffects'),
    (s.ZodNativeEnum = 'ZodNativeEnum'),
    (s.ZodOptional = 'ZodOptional'),
    (s.ZodNullable = 'ZodNullable'),
    (s.ZodDefault = 'ZodDefault'),
    (s.ZodCatch = 'ZodCatch'),
    (s.ZodPromise = 'ZodPromise'),
    (s.ZodBranded = 'ZodBranded'),
    (s.ZodPipeline = 'ZodPipeline'),
    (s.ZodReadonly = 'ZodReadonly'))
})(re || (re = {}))
const cl = kn.create,
  Wy = Ra.create,
  r1 = Yf.create,
  f1 = Zf.create
fl.create
cn.create
const so = nt.create
Mu.create
Du.create
Rl.create
const pp = zu.create
Ua.create
Lu.create
ul.create
qa.create
const o1 = cl()
    .min(1, 'Name is required')
    .max(64, 'Name must be 64 characters or less')
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      'Name must be lowercase letters, numbers, and hyphens. Cannot start/end with hyphen or have consecutive hyphens.'
    )
    .refine(
      (s) => !['anthropic', 'claude'].includes(s.toLowerCase()),
      'Name cannot be a reserved word (anthropic, claude)'
    ),
  d1 = cl().min(1, 'Description is required').max(1024, 'Description must be 1024 characters or less'),
  gp = so({
    'name': o1,
    'description': d1,
    'license': cl().optional(),
    'compatibility': cl().max(500).optional(),
    'metadata': pp(f1()).optional(),
    'allowed-tools': cl().optional(),
    'featured': r1().optional(),
  }),
  h1 = so({ metadata: gp, body: cl() })
so({ metadata: gp, body: cl(), references: pp(cl()).default({}), createdAt: Wy(), updatedAt: Wy() })
const uo = Symbol.for('yaml.alias'),
  Qf = Symbol.for('yaml.document'),
  rl = Symbol.for('yaml.map'),
  vp = Symbol.for('yaml.pair'),
  on = Symbol.for('yaml.scalar'),
  Za = Symbol.for('yaml.seq'),
  It = Symbol.for('yaml.node.type'),
  dl = (s) => !!s && typeof s == 'object' && s[It] === uo,
  ql = (s) => !!s && typeof s == 'object' && s[It] === Qf,
  Va = (s) => !!s && typeof s == 'object' && s[It] === rl,
  Ye = (s) => !!s && typeof s == 'object' && s[It] === vp,
  Ue = (s) => !!s && typeof s == 'object' && s[It] === on,
  Ka = (s) => !!s && typeof s == 'object' && s[It] === Za
function Ze(s) {
  if (s && typeof s == 'object')
    switch (s[It]) {
      case rl:
      case Za:
        return !0
    }
  return !1
}
function Ve(s) {
  if (s && typeof s == 'object')
    switch (s[It]) {
      case uo:
      case rl:
      case on:
      case Za:
        return !0
    }
  return !1
}
const bp = (s) => (Ue(s) || Ze(s)) && !!s.anchor,
  Et = Symbol('break visit'),
  Sp = Symbol('skip children'),
  rn = Symbol('remove node')
function Hl(s, l) {
  const a = _p(l)
  ql(s) ? wa(null, s.contents, a, Object.freeze([s])) === rn && (s.contents = null) : wa(null, s, a, Object.freeze([]))
}
Hl.BREAK = Et
Hl.SKIP = Sp
Hl.REMOVE = rn
function wa(s, l, a, u) {
  const c = Tp(s, l, a, u)
  if (Ve(c) || Ye(c)) return (Np(s, u, c), wa(s, c, a, u))
  if (typeof c != 'symbol') {
    if (Ze(l)) {
      u = Object.freeze(u.concat(l))
      for (let f = 0; f < l.items.length; ++f) {
        const d = wa(f, l.items[f], a, u)
        if (typeof d == 'number') f = d - 1
        else {
          if (d === Et) return Et
          d === rn && (l.items.splice(f, 1), (f -= 1))
        }
      }
    } else if (Ye(l)) {
      u = Object.freeze(u.concat(l))
      const f = wa('key', l.key, a, u)
      if (f === Et) return Et
      f === rn && (l.key = null)
      const d = wa('value', l.value, a, u)
      if (d === Et) return Et
      d === rn && (l.value = null)
    }
  }
  return c
}
async function Yu(s, l) {
  const a = _p(l)
  ql(s)
    ? (await ka(null, s.contents, a, Object.freeze([s]))) === rn && (s.contents = null)
    : await ka(null, s, a, Object.freeze([]))
}
Yu.BREAK = Et
Yu.SKIP = Sp
Yu.REMOVE = rn
async function ka(s, l, a, u) {
  const c = await Tp(s, l, a, u)
  if (Ve(c) || Ye(c)) return (Np(s, u, c), ka(s, c, a, u))
  if (typeof c != 'symbol') {
    if (Ze(l)) {
      u = Object.freeze(u.concat(l))
      for (let f = 0; f < l.items.length; ++f) {
        const d = await ka(f, l.items[f], a, u)
        if (typeof d == 'number') f = d - 1
        else {
          if (d === Et) return Et
          d === rn && (l.items.splice(f, 1), (f -= 1))
        }
      }
    } else if (Ye(l)) {
      u = Object.freeze(u.concat(l))
      const f = await ka('key', l.key, a, u)
      if (f === Et) return Et
      f === rn && (l.key = null)
      const d = await ka('value', l.value, a, u)
      if (d === Et) return Et
      d === rn && (l.value = null)
    }
  }
  return c
}
function _p(s) {
  return typeof s == 'object' && (s.Collection || s.Node || s.Value)
    ? Object.assign(
        { Alias: s.Node, Map: s.Node, Scalar: s.Node, Seq: s.Node },
        s.Value && { Map: s.Value, Scalar: s.Value, Seq: s.Value },
        s.Collection && { Map: s.Collection, Seq: s.Collection },
        s
      )
    : s
}
function Tp(s, l, a, u) {
  var c, f, d, m, g
  if (typeof a == 'function') return a(s, l, u)
  if (Va(l)) return (c = a.Map) == null ? void 0 : c.call(a, s, l, u)
  if (Ka(l)) return (f = a.Seq) == null ? void 0 : f.call(a, s, l, u)
  if (Ye(l)) return (d = a.Pair) == null ? void 0 : d.call(a, s, l, u)
  if (Ue(l)) return (m = a.Scalar) == null ? void 0 : m.call(a, s, l, u)
  if (dl(l)) return (g = a.Alias) == null ? void 0 : g.call(a, s, l, u)
}
function Np(s, l, a) {
  const u = l[l.length - 1]
  if (Ze(u)) u.items[s] = a
  else if (Ye(u)) s === 'key' ? (u.key = a) : (u.value = a)
  else if (ql(u)) u.contents = a
  else {
    const c = dl(u) ? 'alias' : 'scalar'
    throw new Error(`Cannot replace node with ${c} parent`)
  }
}
const m1 = { '!': '%21', ',': '%2C', '[': '%5B', ']': '%5D', '{': '%7B', '}': '%7D' },
  y1 = (s) => s.replace(/[!,[\]{}]/g, (l) => m1[l])
class pt {
  constructor(l, a) {
    ;((this.docStart = null),
      (this.docEnd = !1),
      (this.yaml = Object.assign({}, pt.defaultYaml, l)),
      (this.tags = Object.assign({}, pt.defaultTags, a)))
  }
  clone() {
    const l = new pt(this.yaml, this.tags)
    return ((l.docStart = this.docStart), l)
  }
  atDocument() {
    const l = new pt(this.yaml, this.tags)
    switch (this.yaml.version) {
      case '1.1':
        this.atNextDocument = !0
        break
      case '1.2':
        ;((this.atNextDocument = !1),
          (this.yaml = { explicit: pt.defaultYaml.explicit, version: '1.2' }),
          (this.tags = Object.assign({}, pt.defaultTags)))
        break
    }
    return l
  }
  add(l, a) {
    this.atNextDocument &&
      ((this.yaml = { explicit: pt.defaultYaml.explicit, version: '1.1' }),
      (this.tags = Object.assign({}, pt.defaultTags)),
      (this.atNextDocument = !1))
    const u = l.trim().split(/[ \t]+/),
      c = u.shift()
    switch (c) {
      case '%TAG': {
        if (u.length !== 2 && (a(0, '%TAG directive should contain exactly two parts'), u.length < 2)) return !1
        const [f, d] = u
        return ((this.tags[f] = d), !0)
      }
      case '%YAML': {
        if (((this.yaml.explicit = !0), u.length !== 1))
          return (a(0, '%YAML directive should contain exactly one part'), !1)
        const [f] = u
        if (f === '1.1' || f === '1.2') return ((this.yaml.version = f), !0)
        {
          const d = /^\d+\.\d+$/.test(f)
          return (a(6, `Unsupported YAML version ${f}`, d), !1)
        }
      }
      default:
        return (a(0, `Unknown directive ${c}`, !0), !1)
    }
  }
  tagName(l, a) {
    if (l === '!') return '!'
    if (l[0] !== '!') return (a(`Not a valid tag: ${l}`), null)
    if (l[1] === '<') {
      const d = l.slice(2, -1)
      return d === '!' || d === '!!'
        ? (a(`Verbatim tags aren't resolved, so ${l} is invalid.`), null)
        : (l[l.length - 1] !== '>' && a('Verbatim tags must end with a >'), d)
    }
    const [, u, c] = l.match(/^(.*!)([^!]*)$/s)
    c || a(`The ${l} tag has no suffix`)
    const f = this.tags[u]
    if (f)
      try {
        return f + decodeURIComponent(c)
      } catch (d) {
        return (a(String(d)), null)
      }
    return u === '!' ? l : (a(`Could not resolve tag: ${l}`), null)
  }
  tagString(l) {
    for (const [a, u] of Object.entries(this.tags)) if (l.startsWith(u)) return a + y1(l.substring(u.length))
    return l[0] === '!' ? l : `!<${l}>`
  }
  toString(l) {
    const a = this.yaml.explicit ? [`%YAML ${this.yaml.version || '1.2'}`] : [],
      u = Object.entries(this.tags)
    let c
    if (l && u.length > 0 && Ve(l.contents)) {
      const f = {}
      ;(Hl(l.contents, (d, m) => {
        Ve(m) && m.tag && (f[m.tag] = !0)
      }),
        (c = Object.keys(f)))
    } else c = []
    for (const [f, d] of u)
      (f === '!!' && d === 'tag:yaml.org,2002:') || ((!l || c.some((m) => m.startsWith(d))) && a.push(`%TAG ${f} ${d}`))
    return a.join(`
`)
  }
}
pt.defaultYaml = { explicit: !1, version: '1.2' }
pt.defaultTags = { '!!': 'tag:yaml.org,2002:' }
function xp(s) {
  if (/[\x00-\x19\s,[\]{}]/.test(s)) {
    const a = `Anchor must not contain whitespace or control characters: ${JSON.stringify(s)}`
    throw new Error(a)
  }
  return !0
}
function Ep(s) {
  const l = new Set()
  return (
    Hl(s, {
      Value(a, u) {
        u.anchor && l.add(u.anchor)
      },
    }),
    l
  )
}
function Ap(s, l) {
  for (let a = 1; ; ++a) {
    const u = `${s}${a}`
    if (!l.has(u)) return u
  }
}
function p1(s, l) {
  const a = [],
    u = new Map()
  let c = null
  return {
    onAnchor: (f) => {
      ;(a.push(f), c ?? (c = Ep(s)))
      const d = Ap(l, c)
      return (c.add(d), d)
    },
    setAnchors: () => {
      for (const f of a) {
        const d = u.get(f)
        if (typeof d == 'object' && d.anchor && (Ue(d.node) || Ze(d.node))) d.node.anchor = d.anchor
        else {
          const m = new Error('Failed to resolve repeated object (this should not happen)')
          throw ((m.source = f), m)
        }
      }
    },
    sourceObjects: u,
  }
}
function Ca(s, l, a, u) {
  if (u && typeof u == 'object')
    if (Array.isArray(u))
      for (let c = 0, f = u.length; c < f; ++c) {
        const d = u[c],
          m = Ca(s, u, String(c), d)
        m === void 0 ? delete u[c] : m !== d && (u[c] = m)
      }
    else if (u instanceof Map)
      for (const c of Array.from(u.keys())) {
        const f = u.get(c),
          d = Ca(s, u, c, f)
        d === void 0 ? u.delete(c) : d !== f && u.set(c, d)
      }
    else if (u instanceof Set)
      for (const c of Array.from(u)) {
        const f = Ca(s, u, c, c)
        f === void 0 ? u.delete(c) : f !== c && (u.delete(c), u.add(f))
      }
    else
      for (const [c, f] of Object.entries(u)) {
        const d = Ca(s, u, c, f)
        d === void 0 ? delete u[c] : d !== f && (u[c] = d)
      }
  return s.call(l, a, u)
}
function Jt(s, l, a) {
  if (Array.isArray(s)) return s.map((u, c) => Jt(u, String(c), a))
  if (s && typeof s.toJSON == 'function') {
    if (!a || !bp(s)) return s.toJSON(l, a)
    const u = { aliasCount: 0, count: 1, res: void 0 }
    ;(a.anchors.set(s, u),
      (a.onCreate = (f) => {
        ;((u.res = f), delete a.onCreate)
      }))
    const c = s.toJSON(l, a)
    return (a.onCreate && a.onCreate(c), c)
  }
  return typeof s == 'bigint' && !(a != null && a.keep) ? Number(s) : s
}
class co {
  constructor(l) {
    Object.defineProperty(this, It, { value: l })
  }
  clone() {
    const l = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this))
    return (this.range && (l.range = this.range.slice()), l)
  }
  toJS(l, { mapAsMap: a, maxAliasCount: u, onAnchor: c, reviver: f } = {}) {
    if (!ql(l)) throw new TypeError('A document argument is required')
    const d = {
        anchors: new Map(),
        doc: l,
        keep: !0,
        mapAsMap: a === !0,
        mapKeyWarned: !1,
        maxAliasCount: typeof u == 'number' ? u : 100,
      },
      m = Jt(this, '', d)
    if (typeof c == 'function') for (const { count: g, res: p } of d.anchors.values()) c(p, g)
    return typeof f == 'function' ? Ca(f, { '': m }, '', m) : m
  }
}
class Zu extends co {
  constructor(l) {
    ;(super(uo),
      (this.source = l),
      Object.defineProperty(this, 'tag', {
        set() {
          throw new Error('Alias nodes cannot have tags')
        },
      }))
  }
  resolve(l, a) {
    let u
    a != null && a.aliasResolveCache
      ? (u = a.aliasResolveCache)
      : ((u = []),
        Hl(l, {
          Node: (f, d) => {
            ;(dl(d) || bp(d)) && u.push(d)
          },
        }),
        a && (a.aliasResolveCache = u))
    let c
    for (const f of u) {
      if (f === this) break
      f.anchor === this.source && (c = f)
    }
    return c
  }
  toJSON(l, a) {
    if (!a) return { source: this.source }
    const { anchors: u, doc: c, maxAliasCount: f } = a,
      d = this.resolve(c, a)
    if (!d) {
      const g = `Unresolved alias (the anchor must be set before the alias): ${this.source}`
      throw new ReferenceError(g)
    }
    let m = u.get(d)
    if ((m || (Jt(d, null, a), (m = u.get(d))), !m || m.res === void 0)) {
      const g = 'This should not happen: Alias anchor was not resolved?'
      throw new ReferenceError(g)
    }
    if (f >= 0 && ((m.count += 1), m.aliasCount === 0 && (m.aliasCount = Au(c, d, u)), m.count * m.aliasCount > f)) {
      const g = 'Excessive alias count indicates a resource exhaustion attack'
      throw new ReferenceError(g)
    }
    return m.res
  }
  toString(l, a, u) {
    const c = `*${this.source}`
    if (l) {
      if ((xp(this.source), l.options.verifyAliasOrder && !l.anchors.has(this.source))) {
        const f = `Unresolved alias (the anchor must be set before the alias): ${this.source}`
        throw new Error(f)
      }
      if (l.implicitKey) return `${c} `
    }
    return c
  }
}
function Au(s, l, a) {
  if (dl(l)) {
    const u = l.resolve(s),
      c = a && u && a.get(u)
    return c ? c.count * c.aliasCount : 0
  } else if (Ze(l)) {
    let u = 0
    for (const c of l.items) {
      const f = Au(s, c, a)
      f > u && (u = f)
    }
    return u
  } else if (Ye(l)) {
    const u = Au(s, l.key, a),
      c = Au(s, l.value, a)
    return Math.max(u, c)
  }
  return 1
}
const Op = (s) => !s || (typeof s != 'function' && typeof s != 'object')
class de extends co {
  constructor(l) {
    ;(super(on), (this.value = l))
  }
  toJSON(l, a) {
    return a != null && a.keep ? this.value : Jt(this.value, l, a)
  }
  toString() {
    return String(this.value)
  }
}
de.BLOCK_FOLDED = 'BLOCK_FOLDED'
de.BLOCK_LITERAL = 'BLOCK_LITERAL'
de.PLAIN = 'PLAIN'
de.QUOTE_DOUBLE = 'QUOTE_DOUBLE'
de.QUOTE_SINGLE = 'QUOTE_SINGLE'
const g1 = 'tag:yaml.org,2002:'
function v1(s, l, a) {
  if (l) {
    const u = a.filter((f) => f.tag === l),
      c = u.find((f) => !f.format) ?? u[0]
    if (!c) throw new Error(`Tag ${l} not found`)
    return c
  }
  return a.find((u) => {
    var c
    return ((c = u.identify) == null ? void 0 : c.call(u, s)) && !u.format
  })
}
function Ii(s, l, a) {
  var S, O, E
  if ((ql(s) && (s = s.contents), Ve(s))) return s
  if (Ye(s)) {
    const U = (O = (S = a.schema[rl]).createNode) == null ? void 0 : O.call(S, a.schema, null, a)
    return (U.items.push(s), U)
  }
  ;(s instanceof String ||
    s instanceof Number ||
    s instanceof Boolean ||
    (typeof BigInt < 'u' && s instanceof BigInt)) &&
    (s = s.valueOf())
  const { aliasDuplicateObjects: u, onAnchor: c, onTagObj: f, schema: d, sourceObjects: m } = a
  let g
  if (u && s && typeof s == 'object') {
    if (((g = m.get(s)), g)) return (g.anchor ?? (g.anchor = c(s)), new Zu(g.anchor))
    ;((g = { anchor: null, node: null }), m.set(s, g))
  }
  l != null && l.startsWith('!!') && (l = g1 + l.slice(2))
  let p = v1(s, l, d.tags)
  if (!p) {
    if ((s && typeof s.toJSON == 'function' && (s = s.toJSON()), !s || typeof s != 'object')) {
      const U = new de(s)
      return (g && (g.node = U), U)
    }
    p = s instanceof Map ? d[rl] : Symbol.iterator in Object(s) ? d[Za] : d[rl]
  }
  f && (f(p), delete a.onTagObj)
  const _ =
    p != null && p.createNode
      ? p.createNode(a.schema, s, a)
      : typeof ((E = p == null ? void 0 : p.nodeClass) == null ? void 0 : E.from) == 'function'
        ? p.nodeClass.from(a.schema, s, a)
        : new de(s)
  return (l ? (_.tag = l) : p.default || (_.tag = p.tag), g && (g.node = _), _)
}
function Ru(s, l, a) {
  let u = a
  for (let c = l.length - 1; c >= 0; --c) {
    const f = l[c]
    if (typeof f == 'number' && Number.isInteger(f) && f >= 0) {
      const d = []
      ;((d[f] = u), (u = d))
    } else u = new Map([[f, u]])
  }
  return Ii(u, void 0, {
    aliasDuplicateObjects: !1,
    keepUndefined: !1,
    onAnchor: () => {
      throw new Error('This should not happen, please report a bug.')
    },
    schema: s,
    sourceObjects: new Map(),
  })
}
const Gi = (s) => s == null || (typeof s == 'object' && !!s[Symbol.iterator]().next().done)
class jp extends co {
  constructor(l, a) {
    ;(super(l), Object.defineProperty(this, 'schema', { value: a, configurable: !0, enumerable: !1, writable: !0 }))
  }
  clone(l) {
    const a = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this))
    return (
      l && (a.schema = l),
      (a.items = a.items.map((u) => (Ve(u) || Ye(u) ? u.clone(l) : u))),
      this.range && (a.range = this.range.slice()),
      a
    )
  }
  addIn(l, a) {
    if (Gi(l)) this.add(a)
    else {
      const [u, ...c] = l,
        f = this.get(u, !0)
      if (Ze(f)) f.addIn(c, a)
      else if (f === void 0 && this.schema) this.set(u, Ru(this.schema, c, a))
      else throw new Error(`Expected YAML collection at ${u}. Remaining path: ${c}`)
    }
  }
  deleteIn(l) {
    const [a, ...u] = l
    if (u.length === 0) return this.delete(a)
    const c = this.get(a, !0)
    if (Ze(c)) return c.deleteIn(u)
    throw new Error(`Expected YAML collection at ${a}. Remaining path: ${u}`)
  }
  getIn(l, a) {
    const [u, ...c] = l,
      f = this.get(u, !0)
    return c.length === 0 ? (!a && Ue(f) ? f.value : f) : Ze(f) ? f.getIn(c, a) : void 0
  }
  hasAllNullValues(l) {
    return this.items.every((a) => {
      if (!Ye(a)) return !1
      const u = a.value
      return u == null || (l && Ue(u) && u.value == null && !u.commentBefore && !u.comment && !u.tag)
    })
  }
  hasIn(l) {
    const [a, ...u] = l
    if (u.length === 0) return this.has(a)
    const c = this.get(a, !0)
    return Ze(c) ? c.hasIn(u) : !1
  }
  setIn(l, a) {
    const [u, ...c] = l
    if (c.length === 0) this.set(u, a)
    else {
      const f = this.get(u, !0)
      if (Ze(f)) f.setIn(c, a)
      else if (f === void 0 && this.schema) this.set(u, Ru(this.schema, c, a))
      else throw new Error(`Expected YAML collection at ${u}. Remaining path: ${c}`)
    }
  }
}
const b1 = (s) => s.replace(/^(?!$)(?: $)?/gm, '#')
function Cn(s, l) {
  return /^\n+$/.test(s) ? s.substring(1) : l ? s.replace(/^(?! *$)/gm, l) : s
}
const Dl = (s, l, a) =>
    s.endsWith(`
`)
      ? Cn(a, l)
      : a.includes(`
`)
        ? `
` + Cn(a, l)
        : (s.endsWith(' ') ? '' : ' ') + a,
  wp = 'flow',
  Xf = 'block',
  Ou = 'quoted'
function Vu(
  s,
  l,
  a = 'flow',
  { indentAtStart: u, lineWidth: c = 80, minContentWidth: f = 20, onFold: d, onOverflow: m } = {}
) {
  if (!c || c < 0) return s
  c < f && (f = 0)
  const g = Math.max(1 + f, 1 + c - l.length)
  if (s.length <= g) return s
  const p = [],
    _ = {}
  let S = c - l.length
  typeof u == 'number' && (u > c - Math.max(2, f) ? p.push(0) : (S = c - u))
  let O,
    E,
    U = !1,
    A = -1,
    M = -1,
    K = -1
  a === Xf && ((A = Fy(s, A, l.length)), A !== -1 && (S = A + g))
  for (let I; (I = s[(A += 1)]); ) {
    if (a === Ou && I === '\\') {
      switch (((M = A), s[A + 1])) {
        case 'x':
          A += 3
          break
        case 'u':
          A += 5
          break
        case 'U':
          A += 9
          break
        default:
          A += 1
      }
      K = A
    }
    if (
      I ===
      `
`
    )
      (a === Xf && (A = Fy(s, A, l.length)), (S = A + l.length + g), (O = void 0))
    else {
      if (
        I === ' ' &&
        E &&
        E !== ' ' &&
        E !==
          `
` &&
        E !== '	'
      ) {
        const Y = s[A + 1]
        Y &&
          Y !== ' ' &&
          Y !==
            `
` &&
          Y !== '	' &&
          (O = A)
      }
      if (A >= S)
        if (O) (p.push(O), (S = O + g), (O = void 0))
        else if (a === Ou) {
          for (; E === ' ' || E === '	'; ) ((E = I), (I = s[(A += 1)]), (U = !0))
          const Y = A > K + 1 ? A - 2 : M - 1
          if (_[Y]) return s
          ;(p.push(Y), (_[Y] = !0), (S = Y + g), (O = void 0))
        } else U = !0
    }
    E = I
  }
  if ((U && m && m(), p.length === 0)) return s
  d && d()
  let Z = s.slice(0, p[0])
  for (let I = 0; I < p.length; ++I) {
    const Y = p[I],
      L = p[I + 1] || s.length
    Y === 0
      ? (Z = `
${l}${s.slice(0, L)}`)
      : (a === Ou && _[Y] && (Z += `${s[Y]}\\`),
        (Z += `
${l}${s.slice(Y + 1, L)}`))
  }
  return Z
}
function Fy(s, l, a) {
  let u = l,
    c = l + 1,
    f = s[c]
  for (; f === ' ' || f === '	'; )
    if (l < c + a) f = s[++l]
    else {
      do f = s[++l]
      while (
        f &&
        f !==
          `
`
      )
      ;((u = l), (c = l + 1), (f = s[c]))
    }
  return u
}
const Ku = (s, l) => ({
    indentAtStart: l ? s.indent.length : s.indentAtStart,
    lineWidth: s.options.lineWidth,
    minContentWidth: s.options.minContentWidth,
  }),
  Gu = (s) => /^(%|---|\.\.\.)/m.test(s)
function S1(s, l, a) {
  if (!l || l < 0) return !1
  const u = l - a,
    c = s.length
  if (c <= u) return !1
  for (let f = 0, d = 0; f < c; ++f)
    if (
      s[f] ===
      `
`
    ) {
      if (f - d > u) return !0
      if (((d = f + 1), c - d <= u)) return !1
    }
  return !0
}
function Qi(s, l) {
  const a = JSON.stringify(s)
  if (l.options.doubleQuotedAsJSON) return a
  const { implicitKey: u } = l,
    c = l.options.doubleQuotedMinMultiLineLength,
    f = l.indent || (Gu(s) ? '  ' : '')
  let d = '',
    m = 0
  for (let g = 0, p = a[g]; p; p = a[++g])
    if (
      (p === ' ' &&
        a[g + 1] === '\\' &&
        a[g + 2] === 'n' &&
        ((d += a.slice(m, g) + '\\ '), (g += 1), (m = g), (p = '\\')),
      p === '\\')
    )
      switch (a[g + 1]) {
        case 'u':
          {
            d += a.slice(m, g)
            const _ = a.substr(g + 2, 4)
            switch (_) {
              case '0000':
                d += '\\0'
                break
              case '0007':
                d += '\\a'
                break
              case '000b':
                d += '\\v'
                break
              case '001b':
                d += '\\e'
                break
              case '0085':
                d += '\\N'
                break
              case '00a0':
                d += '\\_'
                break
              case '2028':
                d += '\\L'
                break
              case '2029':
                d += '\\P'
                break
              default:
                _.substr(0, 2) === '00' ? (d += '\\x' + _.substr(2)) : (d += a.substr(g, 6))
            }
            ;((g += 5), (m = g + 1))
          }
          break
        case 'n':
          if (u || a[g + 2] === '"' || a.length < c) g += 1
          else {
            for (
              d +=
                a.slice(m, g) +
                `

`;
              a[g + 2] === '\\' && a[g + 3] === 'n' && a[g + 4] !== '"';

            )
              ((d += `
`),
                (g += 2))
            ;((d += f), a[g + 2] === ' ' && (d += '\\'), (g += 1), (m = g + 1))
          }
          break
        default:
          g += 1
      }
  return ((d = m ? d + a.slice(m) : a), u ? d : Vu(d, f, Ou, Ku(l, !1)))
}
function Jf(s, l) {
  if (
    l.options.singleQuote === !1 ||
    (l.implicitKey &&
      s.includes(`
`)) ||
    /[ \t]\n|\n[ \t]/.test(s)
  )
    return Qi(s, l)
  const a = l.indent || (Gu(s) ? '  ' : ''),
    u =
      "'" +
      s.replace(/'/g, "''").replace(
        /\n+/g,
        `$&
${a}`
      ) +
      "'"
  return l.implicitKey ? u : Vu(u, a, wp, Ku(l, !1))
}
function Ma(s, l) {
  const { singleQuote: a } = l.options
  let u
  if (a === !1) u = Qi
  else {
    const c = s.includes('"'),
      f = s.includes("'")
    c && !f ? (u = Jf) : f && !c ? (u = Qi) : (u = a ? Jf : Qi)
  }
  return u(s, l)
}
let If
try {
  If = new RegExp(
    `(^|(?<!
))
+(?!
|$)`,
    'g'
  )
} catch {
  If = /\n+(?!\n|$)/g
}
function ju({ comment: s, type: l, value: a }, u, c, f) {
  const { blockQuote: d, commentString: m, lineWidth: g } = u.options
  if (!d || /\n[\t ]+$/.test(a)) return Ma(a, u)
  const p = u.indent || (u.forceBlockIndent || Gu(a) ? '  ' : ''),
    _ =
      d === 'literal'
        ? !0
        : d === 'folded' || l === de.BLOCK_FOLDED
          ? !1
          : l === de.BLOCK_LITERAL
            ? !0
            : !S1(a, g, p.length)
  if (!a)
    return _
      ? `|
`
      : `>
`
  let S, O
  for (O = a.length; O > 0; --O) {
    const L = a[O - 1]
    if (
      L !==
        `
` &&
      L !== '	' &&
      L !== ' '
    )
      break
  }
  let E = a.substring(O)
  const U = E.indexOf(`
`)
  ;(U === -1 ? (S = '-') : a === E || U !== E.length - 1 ? ((S = '+'), f && f()) : (S = ''),
    E &&
      ((a = a.slice(0, -E.length)),
      E[E.length - 1] ===
        `
` && (E = E.slice(0, -1)),
      (E = E.replace(If, `$&${p}`))))
  let A = !1,
    M,
    K = -1
  for (M = 0; M < a.length; ++M) {
    const L = a[M]
    if (L === ' ') A = !0
    else if (
      L ===
      `
`
    )
      K = M
    else break
  }
  let Z = a.substring(0, K < M ? K + 1 : M)
  Z && ((a = a.substring(Z.length)), (Z = Z.replace(/\n+/g, `$&${p}`)))
  let Y = (A ? (p ? '2' : '1') : '') + S
  if ((s && ((Y += ' ' + m(s.replace(/ ?[\r\n]+/g, ' '))), c && c()), !_)) {
    const L = a
      .replace(
        /\n+/g,
        `
$&`
      )
      .replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, '$1$2')
      .replace(/\n+/g, `$&${p}`)
    let $ = !1
    const X = Ku(u, !0)
    d !== 'folded' &&
      l !== de.BLOCK_FOLDED &&
      (X.onOverflow = () => {
        $ = !0
      })
    const G = Vu(`${Z}${L}${E}`, p, Xf, X)
    if (!$)
      return `>${Y}
${p}${G}`
  }
  return (
    (a = a.replace(/\n+/g, `$&${p}`)),
    `|${Y}
${p}${Z}${a}${E}`
  )
}
function _1(s, l, a, u) {
  const { type: c, value: f } = s,
    { actualString: d, implicitKey: m, indent: g, indentStep: p, inFlow: _ } = l
  if (
    (m &&
      f.includes(`
`)) ||
    (_ && /[[\]{},]/.test(f))
  )
    return Ma(f, l)
  if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(f))
    return m ||
      _ ||
      !f.includes(`
`)
      ? Ma(f, l)
      : ju(s, l, a, u)
  if (
    !m &&
    !_ &&
    c !== de.PLAIN &&
    f.includes(`
`)
  )
    return ju(s, l, a, u)
  if (Gu(f)) {
    if (g === '') return ((l.forceBlockIndent = !0), ju(s, l, a, u))
    if (m && g === p) return Ma(f, l)
  }
  const S = f.replace(
    /\n+/g,
    `$&
${g}`
  )
  if (d) {
    const O = (A) => {
        var M
        return A.default && A.tag !== 'tag:yaml.org,2002:str' && ((M = A.test) == null ? void 0 : M.test(S))
      },
      { compat: E, tags: U } = l.doc.schema
    if (U.some(O) || (E != null && E.some(O))) return Ma(f, l)
  }
  return m ? S : Vu(S, g, wp, Ku(l, !1))
}
function es(s, l, a, u) {
  const { implicitKey: c, inFlow: f } = l,
    d = typeof s.value == 'string' ? s : Object.assign({}, s, { value: String(s.value) })
  let { type: m } = s
  m !== de.QUOTE_DOUBLE && /[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(d.value) && (m = de.QUOTE_DOUBLE)
  const g = (_) => {
    switch (_) {
      case de.BLOCK_FOLDED:
      case de.BLOCK_LITERAL:
        return c || f ? Ma(d.value, l) : ju(d, l, a, u)
      case de.QUOTE_DOUBLE:
        return Qi(d.value, l)
      case de.QUOTE_SINGLE:
        return Jf(d.value, l)
      case de.PLAIN:
        return _1(d, l, a, u)
      default:
        return null
    }
  }
  let p = g(m)
  if (p === null) {
    const { defaultKeyType: _, defaultStringType: S } = l.options,
      O = (c && _) || S
    if (((p = g(O)), p === null)) throw new Error(`Unsupported default string type ${O}`)
  }
  return p
}
function kp(s, l) {
  const a = Object.assign(
    {
      blockQuote: !0,
      commentString: b1,
      defaultKeyType: null,
      defaultStringType: 'PLAIN',
      directives: null,
      doubleQuotedAsJSON: !1,
      doubleQuotedMinMultiLineLength: 40,
      falseStr: 'false',
      flowCollectionPadding: !0,
      indentSeq: !0,
      lineWidth: 80,
      minContentWidth: 20,
      nullStr: 'null',
      simpleKeys: !1,
      singleQuote: null,
      trueStr: 'true',
      verifyAliasOrder: !0,
    },
    s.schema.toStringOptions,
    l
  )
  let u
  switch (a.collectionStyle) {
    case 'block':
      u = !1
      break
    case 'flow':
      u = !0
      break
    default:
      u = null
  }
  return {
    anchors: new Set(),
    doc: s,
    flowCollectionPadding: a.flowCollectionPadding ? ' ' : '',
    indent: '',
    indentStep: typeof a.indent == 'number' ? ' '.repeat(a.indent) : '  ',
    inFlow: u,
    options: a,
  }
}
function T1(s, l) {
  var c
  if (l.tag) {
    const f = s.filter((d) => d.tag === l.tag)
    if (f.length > 0) return f.find((d) => d.format === l.format) ?? f[0]
  }
  let a, u
  if (Ue(l)) {
    u = l.value
    let f = s.filter((d) => {
      var m
      return (m = d.identify) == null ? void 0 : m.call(d, u)
    })
    if (f.length > 1) {
      const d = f.filter((m) => m.test)
      d.length > 0 && (f = d)
    }
    a = f.find((d) => d.format === l.format) ?? f.find((d) => !d.format)
  } else ((u = l), (a = s.find((f) => f.nodeClass && u instanceof f.nodeClass)))
  if (!a) {
    const f = ((c = u == null ? void 0 : u.constructor) == null ? void 0 : c.name) ?? (u === null ? 'null' : typeof u)
    throw new Error(`Tag not resolved for ${f} value`)
  }
  return a
}
function N1(s, l, { anchors: a, doc: u }) {
  if (!u.directives) return ''
  const c = [],
    f = (Ue(s) || Ze(s)) && s.anchor
  f && xp(f) && (a.add(f), c.push(`&${f}`))
  const d = s.tag ?? (l.default ? null : l.tag)
  return (d && c.push(u.directives.tagString(d)), c.join(' '))
}
function Ha(s, l, a, u) {
  var g
  if (Ye(s)) return s.toString(l, a, u)
  if (dl(s)) {
    if (l.doc.directives) return s.toString(l)
    if ((g = l.resolvedAliases) != null && g.has(s))
      throw new TypeError('Cannot stringify circular structure without alias nodes')
    ;(l.resolvedAliases ? l.resolvedAliases.add(s) : (l.resolvedAliases = new Set([s])), (s = s.resolve(l.doc)))
  }
  let c
  const f = Ve(s) ? s : l.doc.createNode(s, { onTagObj: (p) => (c = p) })
  c ?? (c = T1(l.doc.schema.tags, f))
  const d = N1(f, c, l)
  d.length > 0 && (l.indentAtStart = (l.indentAtStart ?? 0) + d.length + 1)
  const m = typeof c.stringify == 'function' ? c.stringify(f, l, a, u) : Ue(f) ? es(f, l, a, u) : f.toString(l, a, u)
  return d
    ? Ue(f) || m[0] === '{' || m[0] === '['
      ? `${d} ${m}`
      : `${d}
${l.indent}${m}`
    : m
}
function x1({ key: s, value: l }, a, u, c) {
  const {
    allNullValues: f,
    doc: d,
    indent: m,
    indentStep: g,
    options: { commentString: p, indentSeq: _, simpleKeys: S },
  } = a
  let O = (Ve(s) && s.comment) || null
  if (S) {
    if (O) throw new Error('With simple keys, key nodes cannot have comments')
    if (Ze(s) || (!Ve(s) && typeof s == 'object')) {
      const X = 'With simple keys, collection cannot be used as a key value'
      throw new Error(X)
    }
  }
  let E =
    !S &&
    (!s ||
      (O && l == null && !a.inFlow) ||
      Ze(s) ||
      (Ue(s) ? s.type === de.BLOCK_FOLDED || s.type === de.BLOCK_LITERAL : typeof s == 'object'))
  a = Object.assign({}, a, { allNullValues: !1, implicitKey: !E && (S || !f), indent: m + g })
  let U = !1,
    A = !1,
    M = Ha(
      s,
      a,
      () => (U = !0),
      () => (A = !0)
    )
  if (!E && !a.inFlow && M.length > 1024) {
    if (S) throw new Error('With simple keys, single line scalar must not span more than 1024 characters')
    E = !0
  }
  if (a.inFlow) {
    if (f || l == null) return (U && u && u(), M === '' ? '?' : E ? `? ${M}` : M)
  } else if ((f && !S) || (l == null && E))
    return ((M = `? ${M}`), O && !U ? (M += Dl(M, a.indent, p(O))) : A && c && c(), M)
  ;(U && (O = null),
    E
      ? (O && (M += Dl(M, a.indent, p(O))),
        (M = `? ${M}
${m}:`))
      : ((M = `${M}:`), O && (M += Dl(M, a.indent, p(O)))))
  let K, Z, I
  ;(Ve(l)
    ? ((K = !!l.spaceBefore), (Z = l.commentBefore), (I = l.comment))
    : ((K = !1), (Z = null), (I = null), l && typeof l == 'object' && (l = d.createNode(l))),
    (a.implicitKey = !1),
    !E && !O && Ue(l) && (a.indentAtStart = M.length + 1),
    (A = !1),
    !_ &&
      g.length >= 2 &&
      !a.inFlow &&
      !E &&
      Ka(l) &&
      !l.flow &&
      !l.tag &&
      !l.anchor &&
      (a.indent = a.indent.substring(2)))
  let Y = !1
  const L = Ha(
    l,
    a,
    () => (Y = !0),
    () => (A = !0)
  )
  let $ = ' '
  if (O || K || Z) {
    if (
      (($ = K
        ? `
`
        : ''),
      Z)
    ) {
      const X = p(Z)
      $ += `
${Cn(X, a.indent)}`
    }
    L === '' && !a.inFlow
      ? $ ===
          `
` &&
        ($ = `

`)
      : ($ += `
${a.indent}`)
  } else if (!E && Ze(l)) {
    const X = L[0],
      G = L.indexOf(`
`),
      ce = G !== -1,
      We = a.inFlow ?? l.flow ?? l.items.length === 0
    if (ce || !We) {
      let Ke = !1
      if (ce && (X === '&' || X === '!')) {
        let F = L.indexOf(' ')
        ;(X === '&' && F !== -1 && F < G && L[F + 1] === '!' && (F = L.indexOf(' ', F + 1)),
          (F === -1 || G < F) && (Ke = !0))
      }
      Ke ||
        ($ = `
${a.indent}`)
    }
  } else
    (L === '' ||
      L[0] ===
        `
`) &&
      ($ = '')
  return ((M += $ + L), a.inFlow ? Y && u && u() : I && !Y ? (M += Dl(M, a.indent, p(I))) : A && c && c(), M)
}
function Cp(s, l) {
  ;(s === 'debug' || s === 'warn') && console.warn(l)
}
const _u = '<<',
  Mn = {
    identify: (s) => s === _u || (typeof s == 'symbol' && s.description === _u),
    default: 'key',
    tag: 'tag:yaml.org,2002:merge',
    test: /^<<$/,
    resolve: () => Object.assign(new de(Symbol(_u)), { addToJSMap: Mp }),
    stringify: () => _u,
  },
  E1 = (s, l) =>
    (Mn.identify(l) || (Ue(l) && (!l.type || l.type === de.PLAIN) && Mn.identify(l.value))) &&
    (s == null ? void 0 : s.doc.schema.tags.some((a) => a.tag === Mn.tag && a.default))
function Mp(s, l, a) {
  if (((a = s && dl(a) ? a.resolve(s.doc) : a), Ka(a))) for (const u of a.items) kf(s, l, u)
  else if (Array.isArray(a)) for (const u of a) kf(s, l, u)
  else kf(s, l, a)
}
function kf(s, l, a) {
  const u = s && dl(a) ? a.resolve(s.doc) : a
  if (!Va(u)) throw new Error('Merge sources must be maps or map aliases')
  const c = u.toJSON(null, s, Map)
  for (const [f, d] of c)
    l instanceof Map
      ? l.has(f) || l.set(f, d)
      : l instanceof Set
        ? l.add(f)
        : Object.prototype.hasOwnProperty.call(l, f) ||
          Object.defineProperty(l, f, { value: d, writable: !0, enumerable: !0, configurable: !0 })
  return l
}
function Dp(s, l, { key: a, value: u }) {
  if (Ve(a) && a.addToJSMap) a.addToJSMap(s, l, u)
  else if (E1(s, a)) Mp(s, l, u)
  else {
    const c = Jt(a, '', s)
    if (l instanceof Map) l.set(c, Jt(u, c, s))
    else if (l instanceof Set) l.add(c)
    else {
      const f = A1(a, c, s),
        d = Jt(u, f, s)
      f in l ? Object.defineProperty(l, f, { value: d, writable: !0, enumerable: !0, configurable: !0 }) : (l[f] = d)
    }
  }
  return l
}
function A1(s, l, a) {
  if (l === null) return ''
  if (typeof l != 'object') return String(l)
  if (Ve(s) && a != null && a.doc) {
    const u = kp(a.doc, {})
    u.anchors = new Set()
    for (const f of a.anchors.keys()) u.anchors.add(f.anchor)
    ;((u.inFlow = !0), (u.inStringifyKey = !0))
    const c = s.toString(u)
    if (!a.mapKeyWarned) {
      let f = JSON.stringify(c)
      ;(f.length > 40 && (f = f.substring(0, 36) + '..."'),
        Cp(
          a.doc.options.logLevel,
          `Keys with collection values will be stringified due to JS Object restrictions: ${f}. Set mapAsMap: true to use object keys.`
        ),
        (a.mapKeyWarned = !0))
    }
    return c
  }
  return JSON.stringify(l)
}
function ro(s, l, a) {
  const u = Ii(s, void 0, a),
    c = Ii(l, void 0, a)
  return new dt(u, c)
}
class dt {
  constructor(l, a = null) {
    ;(Object.defineProperty(this, It, { value: vp }), (this.key = l), (this.value = a))
  }
  clone(l) {
    let { key: a, value: u } = this
    return (Ve(a) && (a = a.clone(l)), Ve(u) && (u = u.clone(l)), new dt(a, u))
  }
  toJSON(l, a) {
    const u = a != null && a.mapAsMap ? new Map() : {}
    return Dp(a, u, this)
  }
  toString(l, a, u) {
    return l != null && l.doc ? x1(this, l, a, u) : JSON.stringify(this)
  }
}
function zp(s, l, a) {
  return ((l.inFlow ?? s.flow) ? j1 : O1)(s, l, a)
}
function O1(
  { comment: s, items: l },
  a,
  { blockItemPrefix: u, flowChars: c, itemIndent: f, onChompKeep: d, onComment: m }
) {
  const {
      indent: g,
      options: { commentString: p },
    } = a,
    _ = Object.assign({}, a, { indent: f, type: null })
  let S = !1
  const O = []
  for (let U = 0; U < l.length; ++U) {
    const A = l[U]
    let M = null
    if (Ve(A)) (!S && A.spaceBefore && O.push(''), Uu(a, O, A.commentBefore, S), A.comment && (M = A.comment))
    else if (Ye(A)) {
      const Z = Ve(A.key) ? A.key : null
      Z && (!S && Z.spaceBefore && O.push(''), Uu(a, O, Z.commentBefore, S))
    }
    S = !1
    let K = Ha(
      A,
      _,
      () => (M = null),
      () => (S = !0)
    )
    ;(M && (K += Dl(K, f, p(M))), S && M && (S = !1), O.push(u + K))
  }
  let E
  if (O.length === 0) E = c.start + c.end
  else {
    E = O[0]
    for (let U = 1; U < O.length; ++U) {
      const A = O[U]
      E += A
        ? `
${g}${A}`
        : `
`
    }
  }
  return (
    s
      ? ((E +=
          `
` + Cn(p(s), g)),
        m && m())
      : S && d && d(),
    E
  )
}
function j1({ items: s }, l, { flowChars: a, itemIndent: u }) {
  const {
    indent: c,
    indentStep: f,
    flowCollectionPadding: d,
    options: { commentString: m },
  } = l
  u += f
  const g = Object.assign({}, l, { indent: u, inFlow: !0, type: null })
  let p = !1,
    _ = 0
  const S = []
  for (let U = 0; U < s.length; ++U) {
    const A = s[U]
    let M = null
    if (Ve(A)) (A.spaceBefore && S.push(''), Uu(l, S, A.commentBefore, !1), A.comment && (M = A.comment))
    else if (Ye(A)) {
      const Z = Ve(A.key) ? A.key : null
      Z && (Z.spaceBefore && S.push(''), Uu(l, S, Z.commentBefore, !1), Z.comment && (p = !0))
      const I = Ve(A.value) ? A.value : null
      I
        ? (I.comment && (M = I.comment), I.commentBefore && (p = !0))
        : A.value == null && Z != null && Z.comment && (M = Z.comment)
    }
    M && (p = !0)
    let K = Ha(A, g, () => (M = null))
    ;(U < s.length - 1 && (K += ','),
      M && (K += Dl(K, u, m(M))),
      !p &&
        (S.length > _ ||
          K.includes(`
`)) &&
        (p = !0),
      S.push(K),
      (_ = S.length))
  }
  const { start: O, end: E } = a
  if (S.length === 0) return O + E
  if (!p) {
    const U = S.reduce((A, M) => A + M.length + 2, 2)
    p = l.options.lineWidth > 0 && U > l.options.lineWidth
  }
  if (p) {
    let U = O
    for (const A of S)
      U += A
        ? `
${f}${c}${A}`
        : `
`
    return `${U}
${c}${E}`
  } else return `${O}${d}${S.join(' ')}${d}${E}`
}
function Uu({ indent: s, options: { commentString: l } }, a, u, c) {
  if ((u && c && (u = u.replace(/^\n+/, '')), u)) {
    const f = Cn(l(u), s)
    a.push(f.trimStart())
  }
}
function zl(s, l) {
  const a = Ue(l) ? l.value : l
  for (const u of s) if (Ye(u) && (u.key === l || u.key === a || (Ue(u.key) && u.key.value === a))) return u
}
class Bt extends jp {
  static get tagName() {
    return 'tag:yaml.org,2002:map'
  }
  constructor(l) {
    ;(super(rl, l), (this.items = []))
  }
  static from(l, a, u) {
    const { keepUndefined: c, replacer: f } = u,
      d = new this(l),
      m = (g, p) => {
        if (typeof f == 'function') p = f.call(a, g, p)
        else if (Array.isArray(f) && !f.includes(g)) return
        ;(p !== void 0 || c) && d.items.push(ro(g, p, u))
      }
    if (a instanceof Map) for (const [g, p] of a) m(g, p)
    else if (a && typeof a == 'object') for (const g of Object.keys(a)) m(g, a[g])
    return (typeof l.sortMapEntries == 'function' && d.items.sort(l.sortMapEntries), d)
  }
  add(l, a) {
    var d
    let u
    Ye(l)
      ? (u = l)
      : !l || typeof l != 'object' || !('key' in l)
        ? (u = new dt(l, l == null ? void 0 : l.value))
        : (u = new dt(l.key, l.value))
    const c = zl(this.items, u.key),
      f = (d = this.schema) == null ? void 0 : d.sortMapEntries
    if (c) {
      if (!a) throw new Error(`Key ${u.key} already set`)
      Ue(c.value) && Op(u.value) ? (c.value.value = u.value) : (c.value = u.value)
    } else if (f) {
      const m = this.items.findIndex((g) => f(u, g) < 0)
      m === -1 ? this.items.push(u) : this.items.splice(m, 0, u)
    } else this.items.push(u)
  }
  delete(l) {
    const a = zl(this.items, l)
    return a ? this.items.splice(this.items.indexOf(a), 1).length > 0 : !1
  }
  get(l, a) {
    const u = zl(this.items, l),
      c = u == null ? void 0 : u.value
    return (!a && Ue(c) ? c.value : c) ?? void 0
  }
  has(l) {
    return !!zl(this.items, l)
  }
  set(l, a) {
    this.add(new dt(l, a), !0)
  }
  toJSON(l, a, u) {
    const c = u ? new u() : a != null && a.mapAsMap ? new Map() : {}
    a != null && a.onCreate && a.onCreate(c)
    for (const f of this.items) Dp(a, c, f)
    return c
  }
  toString(l, a, u) {
    if (!l) return JSON.stringify(this)
    for (const c of this.items)
      if (!Ye(c)) throw new Error(`Map items must all be pairs; found ${JSON.stringify(c)} instead`)
    return (
      !l.allNullValues && this.hasAllNullValues(!1) && (l = Object.assign({}, l, { allNullValues: !0 })),
      zp(this, l, {
        blockItemPrefix: '',
        flowChars: { start: '{', end: '}' },
        itemIndent: l.indent || '',
        onChompKeep: u,
        onComment: a,
      })
    )
  }
}
const Ga = {
  collection: 'map',
  default: !0,
  nodeClass: Bt,
  tag: 'tag:yaml.org,2002:map',
  resolve(s, l) {
    return (Va(s) || l('Expected a mapping for this tag'), s)
  },
  createNode: (s, l, a) => Bt.from(s, l, a),
}
class ol extends jp {
  static get tagName() {
    return 'tag:yaml.org,2002:seq'
  }
  constructor(l) {
    ;(super(Za, l), (this.items = []))
  }
  add(l) {
    this.items.push(l)
  }
  delete(l) {
    const a = Tu(l)
    return typeof a != 'number' ? !1 : this.items.splice(a, 1).length > 0
  }
  get(l, a) {
    const u = Tu(l)
    if (typeof u != 'number') return
    const c = this.items[u]
    return !a && Ue(c) ? c.value : c
  }
  has(l) {
    const a = Tu(l)
    return typeof a == 'number' && a < this.items.length
  }
  set(l, a) {
    const u = Tu(l)
    if (typeof u != 'number') throw new Error(`Expected a valid index, not ${l}.`)
    const c = this.items[u]
    Ue(c) && Op(a) ? (c.value = a) : (this.items[u] = a)
  }
  toJSON(l, a) {
    const u = []
    a != null && a.onCreate && a.onCreate(u)
    let c = 0
    for (const f of this.items) u.push(Jt(f, String(c++), a))
    return u
  }
  toString(l, a, u) {
    return l
      ? zp(this, l, {
          blockItemPrefix: '- ',
          flowChars: { start: '[', end: ']' },
          itemIndent: (l.indent || '') + '  ',
          onChompKeep: u,
          onComment: a,
        })
      : JSON.stringify(this)
  }
  static from(l, a, u) {
    const { replacer: c } = u,
      f = new this(l)
    if (a && Symbol.iterator in Object(a)) {
      let d = 0
      for (let m of a) {
        if (typeof c == 'function') {
          const g = a instanceof Set ? m : String(d++)
          m = c.call(a, g, m)
        }
        f.items.push(Ii(m, void 0, u))
      }
    }
    return f
  }
}
function Tu(s) {
  let l = Ue(s) ? s.value : s
  return (
    l && typeof l == 'string' && (l = Number(l)),
    typeof l == 'number' && Number.isInteger(l) && l >= 0 ? l : null
  )
}
const $a = {
    collection: 'seq',
    default: !0,
    nodeClass: ol,
    tag: 'tag:yaml.org,2002:seq',
    resolve(s, l) {
      return (Ka(s) || l('Expected a sequence for this tag'), s)
    },
    createNode: (s, l, a) => ol.from(s, l, a),
  },
  $u = {
    identify: (s) => typeof s == 'string',
    default: !0,
    tag: 'tag:yaml.org,2002:str',
    resolve: (s) => s,
    stringify(s, l, a, u) {
      return ((l = Object.assign({ actualString: !0 }, l)), es(s, l, a, u))
    },
  },
  Qu = {
    identify: (s) => s == null,
    createNode: () => new de(null),
    default: !0,
    tag: 'tag:yaml.org,2002:null',
    test: /^(?:~|[Nn]ull|NULL)?$/,
    resolve: () => new de(null),
    stringify: ({ source: s }, l) => (typeof s == 'string' && Qu.test.test(s) ? s : l.options.nullStr),
  },
  fo = {
    identify: (s) => typeof s == 'boolean',
    default: !0,
    tag: 'tag:yaml.org,2002:bool',
    test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
    resolve: (s) => new de(s[0] === 't' || s[0] === 'T'),
    stringify({ source: s, value: l }, a) {
      if (s && fo.test.test(s)) {
        const u = s[0] === 't' || s[0] === 'T'
        if (l === u) return s
      }
      return l ? a.options.trueStr : a.options.falseStr
    },
  }
function nn({ format: s, minFractionDigits: l, tag: a, value: u }) {
  if (typeof u == 'bigint') return String(u)
  const c = typeof u == 'number' ? u : Number(u)
  if (!isFinite(c)) return isNaN(c) ? '.nan' : c < 0 ? '-.inf' : '.inf'
  let f = JSON.stringify(u)
  if (!s && l && (!a || a === 'tag:yaml.org,2002:float') && /^\d/.test(f)) {
    let d = f.indexOf('.')
    d < 0 && ((d = f.length), (f += '.'))
    let m = l - (f.length - d - 1)
    for (; m-- > 0; ) f += '0'
  }
  return f
}
const Lp = {
    identify: (s) => typeof s == 'number',
    default: !0,
    tag: 'tag:yaml.org,2002:float',
    test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
    resolve: (s) =>
      s.slice(-3).toLowerCase() === 'nan' ? NaN : s[0] === '-' ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
    stringify: nn,
  },
  Rp = {
    identify: (s) => typeof s == 'number',
    default: !0,
    tag: 'tag:yaml.org,2002:float',
    format: 'EXP',
    test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
    resolve: (s) => parseFloat(s),
    stringify(s) {
      const l = Number(s.value)
      return isFinite(l) ? l.toExponential() : nn(s)
    },
  },
  Up = {
    identify: (s) => typeof s == 'number',
    default: !0,
    tag: 'tag:yaml.org,2002:float',
    test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
    resolve(s) {
      const l = new de(parseFloat(s)),
        a = s.indexOf('.')
      return (a !== -1 && s[s.length - 1] === '0' && (l.minFractionDigits = s.length - a - 1), l)
    },
    stringify: nn,
  },
  Xu = (s) => typeof s == 'bigint' || Number.isInteger(s),
  oo = (s, l, a, { intAsBigInt: u }) => (u ? BigInt(s) : parseInt(s.substring(l), a))
function Bp(s, l, a) {
  const { value: u } = s
  return Xu(u) && u >= 0 ? a + u.toString(l) : nn(s)
}
const qp = {
    identify: (s) => Xu(s) && s >= 0,
    default: !0,
    tag: 'tag:yaml.org,2002:int',
    format: 'OCT',
    test: /^0o[0-7]+$/,
    resolve: (s, l, a) => oo(s, 2, 8, a),
    stringify: (s) => Bp(s, 8, '0o'),
  },
  Hp = {
    identify: Xu,
    default: !0,
    tag: 'tag:yaml.org,2002:int',
    test: /^[-+]?[0-9]+$/,
    resolve: (s, l, a) => oo(s, 0, 10, a),
    stringify: nn,
  },
  Yp = {
    identify: (s) => Xu(s) && s >= 0,
    default: !0,
    tag: 'tag:yaml.org,2002:int',
    format: 'HEX',
    test: /^0x[0-9a-fA-F]+$/,
    resolve: (s, l, a) => oo(s, 2, 16, a),
    stringify: (s) => Bp(s, 16, '0x'),
  },
  w1 = [Ga, $a, $u, Qu, fo, qp, Hp, Yp, Lp, Rp, Up]
function Py(s) {
  return typeof s == 'bigint' || Number.isInteger(s)
}
const Nu = ({ value: s }) => JSON.stringify(s),
  k1 = [
    {
      identify: (s) => typeof s == 'string',
      default: !0,
      tag: 'tag:yaml.org,2002:str',
      resolve: (s) => s,
      stringify: Nu,
    },
    {
      identify: (s) => s == null,
      createNode: () => new de(null),
      default: !0,
      tag: 'tag:yaml.org,2002:null',
      test: /^null$/,
      resolve: () => null,
      stringify: Nu,
    },
    {
      identify: (s) => typeof s == 'boolean',
      default: !0,
      tag: 'tag:yaml.org,2002:bool',
      test: /^true$|^false$/,
      resolve: (s) => s === 'true',
      stringify: Nu,
    },
    {
      identify: Py,
      default: !0,
      tag: 'tag:yaml.org,2002:int',
      test: /^-?(?:0|[1-9][0-9]*)$/,
      resolve: (s, l, { intAsBigInt: a }) => (a ? BigInt(s) : parseInt(s, 10)),
      stringify: ({ value: s }) => (Py(s) ? s.toString() : JSON.stringify(s)),
    },
    {
      identify: (s) => typeof s == 'number',
      default: !0,
      tag: 'tag:yaml.org,2002:float',
      test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
      resolve: (s) => parseFloat(s),
      stringify: Nu,
    },
  ],
  C1 = {
    default: !0,
    tag: '',
    test: /^/,
    resolve(s, l) {
      return (l(`Unresolved plain scalar ${JSON.stringify(s)}`), s)
    },
  },
  M1 = [Ga, $a].concat(k1, C1),
  ho = {
    identify: (s) => s instanceof Uint8Array,
    default: !1,
    tag: 'tag:yaml.org,2002:binary',
    resolve(s, l) {
      if (typeof atob == 'function') {
        const a = atob(s.replace(/[\n\r]/g, '')),
          u = new Uint8Array(a.length)
        for (let c = 0; c < a.length; ++c) u[c] = a.charCodeAt(c)
        return u
      } else return (l('This environment does not support reading binary tags; either Buffer or atob is required'), s)
    },
    stringify({ comment: s, type: l, value: a }, u, c, f) {
      if (!a) return ''
      const d = a
      let m
      if (typeof btoa == 'function') {
        let g = ''
        for (let p = 0; p < d.length; ++p) g += String.fromCharCode(d[p])
        m = btoa(g)
      } else throw new Error('This environment does not support writing binary tags; either Buffer or btoa is required')
      if ((l ?? (l = de.BLOCK_LITERAL), l !== de.QUOTE_DOUBLE)) {
        const g = Math.max(u.options.lineWidth - u.indent.length, u.options.minContentWidth),
          p = Math.ceil(m.length / g),
          _ = new Array(p)
        for (let S = 0, O = 0; S < p; ++S, O += g) _[S] = m.substr(O, g)
        m = _.join(
          l === de.BLOCK_LITERAL
            ? `
`
            : ' '
        )
      }
      return es({ comment: s, type: l, value: m }, u, c, f)
    },
  }
function Zp(s, l) {
  if (Ka(s))
    for (let a = 0; a < s.items.length; ++a) {
      let u = s.items[a]
      if (!Ye(u)) {
        if (Va(u)) {
          u.items.length > 1 && l('Each pair must have its own sequence indicator')
          const c = u.items[0] || new dt(new de(null))
          if (
            (u.commentBefore &&
              (c.key.commentBefore = c.key.commentBefore
                ? `${u.commentBefore}
${c.key.commentBefore}`
                : u.commentBefore),
            u.comment)
          ) {
            const f = c.value ?? c.key
            f.comment = f.comment
              ? `${u.comment}
${f.comment}`
              : u.comment
          }
          u = c
        }
        s.items[a] = Ye(u) ? u : new dt(u)
      }
    }
  else l('Expected a sequence for this tag')
  return s
}
function Vp(s, l, a) {
  const { replacer: u } = a,
    c = new ol(s)
  c.tag = 'tag:yaml.org,2002:pairs'
  let f = 0
  if (l && Symbol.iterator in Object(l))
    for (let d of l) {
      typeof u == 'function' && (d = u.call(l, String(f++), d))
      let m, g
      if (Array.isArray(d))
        if (d.length === 2) ((m = d[0]), (g = d[1]))
        else throw new TypeError(`Expected [key, value] tuple: ${d}`)
      else if (d && d instanceof Object) {
        const p = Object.keys(d)
        if (p.length === 1) ((m = p[0]), (g = d[m]))
        else throw new TypeError(`Expected tuple with one key, not ${p.length} keys`)
      } else m = d
      c.items.push(ro(m, g, a))
    }
  return c
}
const mo = { collection: 'seq', default: !1, tag: 'tag:yaml.org,2002:pairs', resolve: Zp, createNode: Vp }
class Da extends ol {
  constructor() {
    ;(super(),
      (this.add = Bt.prototype.add.bind(this)),
      (this.delete = Bt.prototype.delete.bind(this)),
      (this.get = Bt.prototype.get.bind(this)),
      (this.has = Bt.prototype.has.bind(this)),
      (this.set = Bt.prototype.set.bind(this)),
      (this.tag = Da.tag))
  }
  toJSON(l, a) {
    if (!a) return super.toJSON(l)
    const u = new Map()
    a != null && a.onCreate && a.onCreate(u)
    for (const c of this.items) {
      let f, d
      if ((Ye(c) ? ((f = Jt(c.key, '', a)), (d = Jt(c.value, f, a))) : (f = Jt(c, '', a)), u.has(f)))
        throw new Error('Ordered maps must not include duplicate keys')
      u.set(f, d)
    }
    return u
  }
  static from(l, a, u) {
    const c = Vp(l, a, u),
      f = new this()
    return ((f.items = c.items), f)
  }
}
Da.tag = 'tag:yaml.org,2002:omap'
const yo = {
  collection: 'seq',
  identify: (s) => s instanceof Map,
  nodeClass: Da,
  default: !1,
  tag: 'tag:yaml.org,2002:omap',
  resolve(s, l) {
    const a = Zp(s, l),
      u = []
    for (const { key: c } of a.items)
      Ue(c) && (u.includes(c.value) ? l(`Ordered maps must not include duplicate keys: ${c.value}`) : u.push(c.value))
    return Object.assign(new Da(), a)
  },
  createNode: (s, l, a) => Da.from(s, l, a),
}
function Kp({ value: s, source: l }, a) {
  return l && (s ? Gp : $p).test.test(l) ? l : s ? a.options.trueStr : a.options.falseStr
}
const Gp = {
    identify: (s) => s === !0,
    default: !0,
    tag: 'tag:yaml.org,2002:bool',
    test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
    resolve: () => new de(!0),
    stringify: Kp,
  },
  $p = {
    identify: (s) => s === !1,
    default: !0,
    tag: 'tag:yaml.org,2002:bool',
    test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
    resolve: () => new de(!1),
    stringify: Kp,
  },
  D1 = {
    identify: (s) => typeof s == 'number',
    default: !0,
    tag: 'tag:yaml.org,2002:float',
    test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
    resolve: (s) =>
      s.slice(-3).toLowerCase() === 'nan' ? NaN : s[0] === '-' ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
    stringify: nn,
  },
  z1 = {
    identify: (s) => typeof s == 'number',
    default: !0,
    tag: 'tag:yaml.org,2002:float',
    format: 'EXP',
    test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
    resolve: (s) => parseFloat(s.replace(/_/g, '')),
    stringify(s) {
      const l = Number(s.value)
      return isFinite(l) ? l.toExponential() : nn(s)
    },
  },
  L1 = {
    identify: (s) => typeof s == 'number',
    default: !0,
    tag: 'tag:yaml.org,2002:float',
    test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
    resolve(s) {
      const l = new de(parseFloat(s.replace(/_/g, ''))),
        a = s.indexOf('.')
      if (a !== -1) {
        const u = s.substring(a + 1).replace(/_/g, '')
        u[u.length - 1] === '0' && (l.minFractionDigits = u.length)
      }
      return l
    },
    stringify: nn,
  },
  ts = (s) => typeof s == 'bigint' || Number.isInteger(s)
function Ju(s, l, a, { intAsBigInt: u }) {
  const c = s[0]
  if (((c === '-' || c === '+') && (l += 1), (s = s.substring(l).replace(/_/g, '')), u)) {
    switch (a) {
      case 2:
        s = `0b${s}`
        break
      case 8:
        s = `0o${s}`
        break
      case 16:
        s = `0x${s}`
        break
    }
    const d = BigInt(s)
    return c === '-' ? BigInt(-1) * d : d
  }
  const f = parseInt(s, a)
  return c === '-' ? -1 * f : f
}
function po(s, l, a) {
  const { value: u } = s
  if (ts(u)) {
    const c = u.toString(l)
    return u < 0 ? '-' + a + c.substr(1) : a + c
  }
  return nn(s)
}
const R1 = {
    identify: ts,
    default: !0,
    tag: 'tag:yaml.org,2002:int',
    format: 'BIN',
    test: /^[-+]?0b[0-1_]+$/,
    resolve: (s, l, a) => Ju(s, 2, 2, a),
    stringify: (s) => po(s, 2, '0b'),
  },
  U1 = {
    identify: ts,
    default: !0,
    tag: 'tag:yaml.org,2002:int',
    format: 'OCT',
    test: /^[-+]?0[0-7_]+$/,
    resolve: (s, l, a) => Ju(s, 1, 8, a),
    stringify: (s) => po(s, 8, '0'),
  },
  B1 = {
    identify: ts,
    default: !0,
    tag: 'tag:yaml.org,2002:int',
    test: /^[-+]?[0-9][0-9_]*$/,
    resolve: (s, l, a) => Ju(s, 0, 10, a),
    stringify: nn,
  },
  q1 = {
    identify: ts,
    default: !0,
    tag: 'tag:yaml.org,2002:int',
    format: 'HEX',
    test: /^[-+]?0x[0-9a-fA-F_]+$/,
    resolve: (s, l, a) => Ju(s, 2, 16, a),
    stringify: (s) => po(s, 16, '0x'),
  }
class za extends Bt {
  constructor(l) {
    ;(super(l), (this.tag = za.tag))
  }
  add(l) {
    let a
    ;(Ye(l)
      ? (a = l)
      : l && typeof l == 'object' && 'key' in l && 'value' in l && l.value === null
        ? (a = new dt(l.key, null))
        : (a = new dt(l, null)),
      zl(this.items, a.key) || this.items.push(a))
  }
  get(l, a) {
    const u = zl(this.items, l)
    return !a && Ye(u) ? (Ue(u.key) ? u.key.value : u.key) : u
  }
  set(l, a) {
    if (typeof a != 'boolean')
      throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof a}`)
    const u = zl(this.items, l)
    u && !a ? this.items.splice(this.items.indexOf(u), 1) : !u && a && this.items.push(new dt(l))
  }
  toJSON(l, a) {
    return super.toJSON(l, a, Set)
  }
  toString(l, a, u) {
    if (!l) return JSON.stringify(this)
    if (this.hasAllNullValues(!0)) return super.toString(Object.assign({}, l, { allNullValues: !0 }), a, u)
    throw new Error('Set items must all have null values')
  }
  static from(l, a, u) {
    const { replacer: c } = u,
      f = new this(l)
    if (a && Symbol.iterator in Object(a))
      for (let d of a) (typeof c == 'function' && (d = c.call(a, d, d)), f.items.push(ro(d, null, u)))
    return f
  }
}
za.tag = 'tag:yaml.org,2002:set'
const go = {
  collection: 'map',
  identify: (s) => s instanceof Set,
  nodeClass: za,
  default: !1,
  tag: 'tag:yaml.org,2002:set',
  createNode: (s, l, a) => za.from(s, l, a),
  resolve(s, l) {
    if (Va(s)) {
      if (s.hasAllNullValues(!0)) return Object.assign(new za(), s)
      l('Set items must all have null values')
    } else l('Expected a mapping for this tag')
    return s
  },
}
function vo(s, l) {
  const a = s[0],
    u = a === '-' || a === '+' ? s.substring(1) : s,
    c = (d) => (l ? BigInt(d) : Number(d)),
    f = u
      .replace(/_/g, '')
      .split(':')
      .reduce((d, m) => d * c(60) + c(m), c(0))
  return a === '-' ? c(-1) * f : f
}
function Qp(s) {
  let { value: l } = s,
    a = (d) => d
  if (typeof l == 'bigint') a = (d) => BigInt(d)
  else if (isNaN(l) || !isFinite(l)) return nn(s)
  let u = ''
  l < 0 && ((u = '-'), (l *= a(-1)))
  const c = a(60),
    f = [l % c]
  return (
    l < 60 ? f.unshift(0) : ((l = (l - f[0]) / c), f.unshift(l % c), l >= 60 && ((l = (l - f[0]) / c), f.unshift(l))),
    u +
      f
        .map((d) => String(d).padStart(2, '0'))
        .join(':')
        .replace(/000000\d*$/, '')
  )
}
const Xp = {
    identify: (s) => typeof s == 'bigint' || Number.isInteger(s),
    default: !0,
    tag: 'tag:yaml.org,2002:int',
    format: 'TIME',
    test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
    resolve: (s, l, { intAsBigInt: a }) => vo(s, a),
    stringify: Qp,
  },
  Jp = {
    identify: (s) => typeof s == 'number',
    default: !0,
    tag: 'tag:yaml.org,2002:float',
    format: 'TIME',
    test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
    resolve: (s) => vo(s, !1),
    stringify: Qp,
  },
  Iu = {
    identify: (s) => s instanceof Date,
    default: !0,
    tag: 'tag:yaml.org,2002:timestamp',
    test: RegExp(
      '^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:t|T|[ \\t]+)([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?)?$'
    ),
    resolve(s) {
      const l = s.match(Iu.test)
      if (!l) throw new Error('!!timestamp expects a date, starting with yyyy-mm-dd')
      const [, a, u, c, f, d, m] = l.map(Number),
        g = l[7] ? Number((l[7] + '00').substr(1, 3)) : 0
      let p = Date.UTC(a, u - 1, c, f || 0, d || 0, m || 0, g)
      const _ = l[8]
      if (_ && _ !== 'Z') {
        let S = vo(_, !1)
        ;(Math.abs(S) < 30 && (S *= 60), (p -= 6e4 * S))
      }
      return new Date(p)
    },
    stringify: ({ value: s }) => (s == null ? void 0 : s.toISOString().replace(/(T00:00:00)?\.000Z$/, '')) ?? '',
  },
  ep = [Ga, $a, $u, Qu, Gp, $p, R1, U1, B1, q1, D1, z1, L1, ho, Mn, yo, mo, go, Xp, Jp, Iu],
  tp = new Map([
    ['core', w1],
    ['failsafe', [Ga, $a, $u]],
    ['json', M1],
    ['yaml11', ep],
    ['yaml-1.1', ep],
  ]),
  np = {
    binary: ho,
    bool: fo,
    float: Up,
    floatExp: Rp,
    floatNaN: Lp,
    floatTime: Jp,
    int: Hp,
    intHex: Yp,
    intOct: qp,
    intTime: Xp,
    map: Ga,
    merge: Mn,
    null: Qu,
    omap: yo,
    pairs: mo,
    seq: $a,
    set: go,
    timestamp: Iu,
  },
  H1 = {
    'tag:yaml.org,2002:binary': ho,
    'tag:yaml.org,2002:merge': Mn,
    'tag:yaml.org,2002:omap': yo,
    'tag:yaml.org,2002:pairs': mo,
    'tag:yaml.org,2002:set': go,
    'tag:yaml.org,2002:timestamp': Iu,
  }
function Cf(s, l, a) {
  const u = tp.get(l)
  if (u && !s) return a && !u.includes(Mn) ? u.concat(Mn) : u.slice()
  let c = u
  if (!c)
    if (Array.isArray(s)) c = []
    else {
      const f = Array.from(tp.keys())
        .filter((d) => d !== 'yaml11')
        .map((d) => JSON.stringify(d))
        .join(', ')
      throw new Error(`Unknown schema "${l}"; use one of ${f} or define customTags array`)
    }
  if (Array.isArray(s)) for (const f of s) c = c.concat(f)
  else typeof s == 'function' && (c = s(c.slice()))
  return (
    a && (c = c.concat(Mn)),
    c.reduce((f, d) => {
      const m = typeof d == 'string' ? np[d] : d
      if (!m) {
        const g = JSON.stringify(d),
          p = Object.keys(np)
            .map((_) => JSON.stringify(_))
            .join(', ')
        throw new Error(`Unknown custom tag ${g}; use one of ${p}`)
      }
      return (f.includes(m) || f.push(m), f)
    }, [])
  )
}
const Y1 = (s, l) => (s.key < l.key ? -1 : s.key > l.key ? 1 : 0)
class Wu {
  constructor({
    compat: l,
    customTags: a,
    merge: u,
    resolveKnownTags: c,
    schema: f,
    sortMapEntries: d,
    toStringDefaults: m,
  }) {
    ;((this.compat = Array.isArray(l) ? Cf(l, 'compat') : l ? Cf(null, l) : null),
      (this.name = (typeof f == 'string' && f) || 'core'),
      (this.knownTags = c ? H1 : {}),
      (this.tags = Cf(a, this.name, u)),
      (this.toStringOptions = m ?? null),
      Object.defineProperty(this, rl, { value: Ga }),
      Object.defineProperty(this, on, { value: $u }),
      Object.defineProperty(this, Za, { value: $a }),
      (this.sortMapEntries = typeof d == 'function' ? d : d === !0 ? Y1 : null))
  }
  clone() {
    const l = Object.create(Wu.prototype, Object.getOwnPropertyDescriptors(this))
    return ((l.tags = this.tags.slice()), l)
  }
}
function Z1(s, l) {
  var g
  const a = []
  let u = l.directives === !0
  if (l.directives !== !1 && s.directives) {
    const p = s.directives.toString(s)
    p ? (a.push(p), (u = !0)) : s.directives.docStart && (u = !0)
  }
  u && a.push('---')
  const c = kp(s, l),
    { commentString: f } = c.options
  if (s.commentBefore) {
    a.length !== 1 && a.unshift('')
    const p = f(s.commentBefore)
    a.unshift(Cn(p, ''))
  }
  let d = !1,
    m = null
  if (s.contents) {
    if (Ve(s.contents)) {
      if ((s.contents.spaceBefore && u && a.push(''), s.contents.commentBefore)) {
        const S = f(s.contents.commentBefore)
        a.push(Cn(S, ''))
      }
      ;((c.forceBlockIndent = !!s.comment), (m = s.contents.comment))
    }
    const p = m ? void 0 : () => (d = !0)
    let _ = Ha(s.contents, c, () => (m = null), p)
    ;(m && (_ += Dl(_, '', f(m))),
      (_[0] === '|' || _[0] === '>') && a[a.length - 1] === '---' ? (a[a.length - 1] = `--- ${_}`) : a.push(_))
  } else a.push(Ha(s.contents, c))
  if ((g = s.directives) != null && g.docEnd)
    if (s.comment) {
      const p = f(s.comment)
      p.includes(`
`)
        ? (a.push('...'), a.push(Cn(p, '')))
        : a.push(`... ${p}`)
    } else a.push('...')
  else {
    let p = s.comment
    ;(p && d && (p = p.replace(/^\n+/, '')),
      p && ((!d || m) && a[a.length - 1] !== '' && a.push(''), a.push(Cn(f(p), ''))))
  }
  return (
    a.join(`
`) +
    `
`
  )
}
class Qa {
  constructor(l, a, u) {
    ;((this.commentBefore = null),
      (this.comment = null),
      (this.errors = []),
      (this.warnings = []),
      Object.defineProperty(this, It, { value: Qf }))
    let c = null
    typeof a == 'function' || Array.isArray(a) ? (c = a) : u === void 0 && a && ((u = a), (a = void 0))
    const f = Object.assign(
      {
        intAsBigInt: !1,
        keepSourceTokens: !1,
        logLevel: 'warn',
        prettyErrors: !0,
        strict: !0,
        stringKeys: !1,
        uniqueKeys: !0,
        version: '1.2',
      },
      u
    )
    this.options = f
    let { version: d } = f
    ;(u != null && u._directives
      ? ((this.directives = u._directives.atDocument()),
        this.directives.yaml.explicit && (d = this.directives.yaml.version))
      : (this.directives = new pt({ version: d })),
      this.setSchema(d, u),
      (this.contents = l === void 0 ? null : this.createNode(l, c, u)))
  }
  clone() {
    const l = Object.create(Qa.prototype, { [It]: { value: Qf } })
    return (
      (l.commentBefore = this.commentBefore),
      (l.comment = this.comment),
      (l.errors = this.errors.slice()),
      (l.warnings = this.warnings.slice()),
      (l.options = Object.assign({}, this.options)),
      this.directives && (l.directives = this.directives.clone()),
      (l.schema = this.schema.clone()),
      (l.contents = Ve(this.contents) ? this.contents.clone(l.schema) : this.contents),
      this.range && (l.range = this.range.slice()),
      l
    )
  }
  add(l) {
    Ea(this.contents) && this.contents.add(l)
  }
  addIn(l, a) {
    Ea(this.contents) && this.contents.addIn(l, a)
  }
  createAlias(l, a) {
    if (!l.anchor) {
      const u = Ep(this)
      l.anchor = !a || u.has(a) ? Ap(a || 'a', u) : a
    }
    return new Zu(l.anchor)
  }
  createNode(l, a, u) {
    let c
    if (typeof a == 'function') ((l = a.call({ '': l }, '', l)), (c = a))
    else if (Array.isArray(a)) {
      const M = (Z) => typeof Z == 'number' || Z instanceof String || Z instanceof Number,
        K = a.filter(M).map(String)
      ;(K.length > 0 && (a = a.concat(K)), (c = a))
    } else u === void 0 && a && ((u = a), (a = void 0))
    const { aliasDuplicateObjects: f, anchorPrefix: d, flow: m, keepUndefined: g, onTagObj: p, tag: _ } = u ?? {},
      { onAnchor: S, setAnchors: O, sourceObjects: E } = p1(this, d || 'a'),
      U = {
        aliasDuplicateObjects: f ?? !0,
        keepUndefined: g ?? !1,
        onAnchor: S,
        onTagObj: p,
        replacer: c,
        schema: this.schema,
        sourceObjects: E,
      },
      A = Ii(l, _, U)
    return (m && Ze(A) && (A.flow = !0), O(), A)
  }
  createPair(l, a, u = {}) {
    const c = this.createNode(l, null, u),
      f = this.createNode(a, null, u)
    return new dt(c, f)
  }
  delete(l) {
    return Ea(this.contents) ? this.contents.delete(l) : !1
  }
  deleteIn(l) {
    return Gi(l)
      ? this.contents == null
        ? !1
        : ((this.contents = null), !0)
      : Ea(this.contents)
        ? this.contents.deleteIn(l)
        : !1
  }
  get(l, a) {
    return Ze(this.contents) ? this.contents.get(l, a) : void 0
  }
  getIn(l, a) {
    return Gi(l)
      ? !a && Ue(this.contents)
        ? this.contents.value
        : this.contents
      : Ze(this.contents)
        ? this.contents.getIn(l, a)
        : void 0
  }
  has(l) {
    return Ze(this.contents) ? this.contents.has(l) : !1
  }
  hasIn(l) {
    return Gi(l) ? this.contents !== void 0 : Ze(this.contents) ? this.contents.hasIn(l) : !1
  }
  set(l, a) {
    this.contents == null ? (this.contents = Ru(this.schema, [l], a)) : Ea(this.contents) && this.contents.set(l, a)
  }
  setIn(l, a) {
    Gi(l)
      ? (this.contents = a)
      : this.contents == null
        ? (this.contents = Ru(this.schema, Array.from(l), a))
        : Ea(this.contents) && this.contents.setIn(l, a)
  }
  setSchema(l, a = {}) {
    typeof l == 'number' && (l = String(l))
    let u
    switch (l) {
      case '1.1':
        ;(this.directives ? (this.directives.yaml.version = '1.1') : (this.directives = new pt({ version: '1.1' })),
          (u = { resolveKnownTags: !1, schema: 'yaml-1.1' }))
        break
      case '1.2':
      case 'next':
        ;(this.directives ? (this.directives.yaml.version = l) : (this.directives = new pt({ version: l })),
          (u = { resolveKnownTags: !0, schema: 'core' }))
        break
      case null:
        ;(this.directives && delete this.directives, (u = null))
        break
      default: {
        const c = JSON.stringify(l)
        throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${c}`)
      }
    }
    if (a.schema instanceof Object) this.schema = a.schema
    else if (u) this.schema = new Wu(Object.assign(u, a))
    else throw new Error('With a null YAML version, the { schema: Schema } option is required')
  }
  toJS({ json: l, jsonArg: a, mapAsMap: u, maxAliasCount: c, onAnchor: f, reviver: d } = {}) {
    const m = {
        anchors: new Map(),
        doc: this,
        keep: !l,
        mapAsMap: u === !0,
        mapKeyWarned: !1,
        maxAliasCount: typeof c == 'number' ? c : 100,
      },
      g = Jt(this.contents, a ?? '', m)
    if (typeof f == 'function') for (const { count: p, res: _ } of m.anchors.values()) f(_, p)
    return typeof d == 'function' ? Ca(d, { '': g }, '', g) : g
  }
  toJSON(l, a) {
    return this.toJS({ json: !0, jsonArg: l, mapAsMap: !1, onAnchor: a })
  }
  toString(l = {}) {
    if (this.errors.length > 0) throw new Error('Document with errors cannot be stringified')
    if ('indent' in l && (!Number.isInteger(l.indent) || Number(l.indent) <= 0)) {
      const a = JSON.stringify(l.indent)
      throw new Error(`"indent" option must be a positive integer, not ${a}`)
    }
    return Z1(this, l)
  }
}
function Ea(s) {
  if (Ze(s)) return !0
  throw new Error('Expected a YAML collection as document contents')
}
class bo extends Error {
  constructor(l, a, u, c) {
    ;(super(), (this.name = l), (this.code = u), (this.message = c), (this.pos = a))
  }
}
class Ll extends bo {
  constructor(l, a, u) {
    super('YAMLParseError', l, a, u)
  }
}
class Ip extends bo {
  constructor(l, a, u) {
    super('YAMLWarning', l, a, u)
  }
}
const Bu = (s, l) => (a) => {
  if (a.pos[0] === -1) return
  a.linePos = a.pos.map((m) => l.linePos(m))
  const { line: u, col: c } = a.linePos[0]
  a.message += ` at line ${u}, column ${c}`
  let f = c - 1,
    d = s.substring(l.lineStarts[u - 1], l.lineStarts[u]).replace(/[\n\r]+$/, '')
  if (f >= 60 && d.length > 80) {
    const m = Math.min(f - 39, d.length - 79)
    ;((d = '…' + d.substring(m)), (f -= m - 1))
  }
  if ((d.length > 80 && (d = d.substring(0, 79) + '…'), u > 1 && /^ *$/.test(d.substring(0, f)))) {
    let m = s.substring(l.lineStarts[u - 2], l.lineStarts[u - 1])
    ;(m.length > 80 &&
      (m =
        m.substring(0, 79) +
        `…
`),
      (d = m + d))
  }
  if (/[^ ]/.test(d)) {
    let m = 1
    const g = a.linePos[1]
    g && g.line === u && g.col > c && (m = Math.max(1, Math.min(g.col - c, 80 - f)))
    const p = ' '.repeat(f) + '^'.repeat(m)
    a.message += `:

${d}
${p}
`
  }
}
function Ya(s, { flow: l, indicator: a, next: u, offset: c, onError: f, parentIndent: d, startOnNewline: m }) {
  let g = !1,
    p = m,
    _ = m,
    S = '',
    O = '',
    E = !1,
    U = !1,
    A = null,
    M = null,
    K = null,
    Z = null,
    I = null,
    Y = null,
    L = null
  for (const G of s)
    switch (
      (U &&
        (G.type !== 'space' &&
          G.type !== 'newline' &&
          G.type !== 'comma' &&
          f(G.offset, 'MISSING_CHAR', 'Tags and anchors must be separated from the next token by white space'),
        (U = !1)),
      A &&
        (p &&
          G.type !== 'comment' &&
          G.type !== 'newline' &&
          f(A, 'TAB_AS_INDENT', 'Tabs are not allowed as indentation'),
        (A = null)),
      G.type)
    ) {
      case 'space':
        ;(!l &&
          (a !== 'doc-start' || (u == null ? void 0 : u.type) !== 'flow-collection') &&
          G.source.includes('	') &&
          (A = G),
          (_ = !0))
        break
      case 'comment': {
        _ || f(G, 'MISSING_CHAR', 'Comments must be separated from other tokens by white space characters')
        const ce = G.source.substring(1) || ' '
        ;(S ? (S += O + ce) : (S = ce), (O = ''), (p = !1))
        break
      }
      case 'newline':
        ;(p ? (S ? (S += G.source) : (!Y || a !== 'seq-item-ind') && (g = !0)) : (O += G.source),
          (p = !0),
          (E = !0),
          (M || K) && (Z = G),
          (_ = !0))
        break
      case 'anchor':
        ;(M && f(G, 'MULTIPLE_ANCHORS', 'A node can have at most one anchor'),
          G.source.endsWith(':') &&
            f(G.offset + G.source.length - 1, 'BAD_ALIAS', 'Anchor ending in : is ambiguous', !0),
          (M = G),
          L ?? (L = G.offset),
          (p = !1),
          (_ = !1),
          (U = !0))
        break
      case 'tag': {
        ;(K && f(G, 'MULTIPLE_TAGS', 'A node can have at most one tag'),
          (K = G),
          L ?? (L = G.offset),
          (p = !1),
          (_ = !1),
          (U = !0))
        break
      }
      case a:
        ;((M || K) && f(G, 'BAD_PROP_ORDER', `Anchors and tags must be after the ${G.source} indicator`),
          Y && f(G, 'UNEXPECTED_TOKEN', `Unexpected ${G.source} in ${l ?? 'collection'}`),
          (Y = G),
          (p = a === 'seq-item-ind' || a === 'explicit-key-ind'),
          (_ = !1))
        break
      case 'comma':
        if (l) {
          ;(I && f(G, 'UNEXPECTED_TOKEN', `Unexpected , in ${l}`), (I = G), (p = !1), (_ = !1))
          break
        }
      default:
        ;(f(G, 'UNEXPECTED_TOKEN', `Unexpected ${G.type} token`), (p = !1), (_ = !1))
    }
  const $ = s[s.length - 1],
    X = $ ? $.offset + $.source.length : c
  return (
    U &&
      u &&
      u.type !== 'space' &&
      u.type !== 'newline' &&
      u.type !== 'comma' &&
      (u.type !== 'scalar' || u.source !== '') &&
      f(u.offset, 'MISSING_CHAR', 'Tags and anchors must be separated from the next token by white space'),
    A &&
      ((p && A.indent <= d) ||
        (u == null ? void 0 : u.type) === 'block-map' ||
        (u == null ? void 0 : u.type) === 'block-seq') &&
      f(A, 'TAB_AS_INDENT', 'Tabs are not allowed as indentation'),
    {
      comma: I,
      found: Y,
      spaceBefore: g,
      comment: S,
      hasNewline: E,
      anchor: M,
      tag: K,
      newlineAfterProp: Z,
      end: X,
      start: L ?? X,
    }
  )
}
function Wi(s) {
  if (!s) return null
  switch (s.type) {
    case 'alias':
    case 'scalar':
    case 'double-quoted-scalar':
    case 'single-quoted-scalar':
      if (
        s.source.includes(`
`)
      )
        return !0
      if (s.end) {
        for (const l of s.end) if (l.type === 'newline') return !0
      }
      return !1
    case 'flow-collection':
      for (const l of s.items) {
        for (const a of l.start) if (a.type === 'newline') return !0
        if (l.sep) {
          for (const a of l.sep) if (a.type === 'newline') return !0
        }
        if (Wi(l.key) || Wi(l.value)) return !0
      }
      return !1
    default:
      return !0
  }
}
function Wf(s, l, a) {
  if ((l == null ? void 0 : l.type) === 'flow-collection') {
    const u = l.end[0]
    u.indent === s &&
      (u.source === ']' || u.source === '}') &&
      Wi(l) &&
      a(u, 'BAD_INDENT', 'Flow end indicator should be more indented than parent', !0)
  }
}
function Wp(s, l, a) {
  const { uniqueKeys: u } = s.options
  if (u === !1) return !1
  const c = typeof u == 'function' ? u : (f, d) => f === d || (Ue(f) && Ue(d) && f.value === d.value)
  return l.some((f) => c(f.key, a))
}
const lp = 'All mapping items must start at the same column'
function V1({ composeNode: s, composeEmptyNode: l }, a, u, c, f) {
  var _
  const d = (f == null ? void 0 : f.nodeClass) ?? Bt,
    m = new d(a.schema)
  a.atRoot && (a.atRoot = !1)
  let g = u.offset,
    p = null
  for (const S of u.items) {
    const { start: O, key: E, sep: U, value: A } = S,
      M = Ya(O, {
        indicator: 'explicit-key-ind',
        next: E ?? (U == null ? void 0 : U[0]),
        offset: g,
        onError: c,
        parentIndent: u.indent,
        startOnNewline: !0,
      }),
      K = !M.found
    if (K) {
      if (
        (E &&
          (E.type === 'block-seq'
            ? c(g, 'BLOCK_AS_IMPLICIT_KEY', 'A block sequence may not be used as an implicit map key')
            : 'indent' in E && E.indent !== u.indent && c(g, 'BAD_INDENT', lp)),
        !M.anchor && !M.tag && !U)
      ) {
        ;((p = M.end),
          M.comment &&
            (m.comment
              ? (m.comment +=
                  `
` + M.comment)
              : (m.comment = M.comment)))
        continue
      }
      ;(M.newlineAfterProp || Wi(E)) &&
        c(E ?? O[O.length - 1], 'MULTILINE_IMPLICIT_KEY', 'Implicit keys need to be on a single line')
    } else ((_ = M.found) == null ? void 0 : _.indent) !== u.indent && c(g, 'BAD_INDENT', lp)
    a.atKey = !0
    const Z = M.end,
      I = E ? s(a, E, M, c) : l(a, Z, O, null, M, c)
    ;(a.schema.compat && Wf(u.indent, E, c),
      (a.atKey = !1),
      Wp(a, m.items, I) && c(Z, 'DUPLICATE_KEY', 'Map keys must be unique'))
    const Y = Ya(U ?? [], {
      indicator: 'map-value-ind',
      next: A,
      offset: I.range[2],
      onError: c,
      parentIndent: u.indent,
      startOnNewline: !E || E.type === 'block-scalar',
    })
    if (((g = Y.end), Y.found)) {
      K &&
        ((A == null ? void 0 : A.type) === 'block-map' &&
          !Y.hasNewline &&
          c(g, 'BLOCK_AS_IMPLICIT_KEY', 'Nested mappings are not allowed in compact mappings'),
        a.options.strict &&
          M.start < Y.found.offset - 1024 &&
          c(
            I.range,
            'KEY_OVER_1024_CHARS',
            'The : indicator must be at most 1024 chars after the start of an implicit block mapping key'
          ))
      const L = A ? s(a, A, Y, c) : l(a, g, U, null, Y, c)
      ;(a.schema.compat && Wf(u.indent, A, c), (g = L.range[2]))
      const $ = new dt(I, L)
      ;(a.options.keepSourceTokens && ($.srcToken = S), m.items.push($))
    } else {
      ;(K && c(I.range, 'MISSING_CHAR', 'Implicit map keys need to be followed by map values'),
        Y.comment &&
          (I.comment
            ? (I.comment +=
                `
` + Y.comment)
            : (I.comment = Y.comment)))
      const L = new dt(I)
      ;(a.options.keepSourceTokens && (L.srcToken = S), m.items.push(L))
    }
  }
  return (p && p < g && c(p, 'IMPOSSIBLE', 'Map comment with trailing content'), (m.range = [u.offset, g, p ?? g]), m)
}
function K1({ composeNode: s, composeEmptyNode: l }, a, u, c, f) {
  const d = (f == null ? void 0 : f.nodeClass) ?? ol,
    m = new d(a.schema)
  ;(a.atRoot && (a.atRoot = !1), a.atKey && (a.atKey = !1))
  let g = u.offset,
    p = null
  for (const { start: _, value: S } of u.items) {
    const O = Ya(_, {
      indicator: 'seq-item-ind',
      next: S,
      offset: g,
      onError: c,
      parentIndent: u.indent,
      startOnNewline: !0,
    })
    if (!O.found)
      if (O.anchor || O.tag || S)
        S && S.type === 'block-seq'
          ? c(O.end, 'BAD_INDENT', 'All sequence items must start at the same column')
          : c(g, 'MISSING_CHAR', 'Sequence item without - indicator')
      else {
        ;((p = O.end), O.comment && (m.comment = O.comment))
        continue
      }
    const E = S ? s(a, S, O, c) : l(a, O.end, _, null, O, c)
    ;(a.schema.compat && Wf(u.indent, S, c), (g = E.range[2]), m.items.push(E))
  }
  return ((m.range = [u.offset, g, p ?? g]), m)
}
function ns(s, l, a, u) {
  let c = ''
  if (s) {
    let f = !1,
      d = ''
    for (const m of s) {
      const { source: g, type: p } = m
      switch (p) {
        case 'space':
          f = !0
          break
        case 'comment': {
          a && !f && u(m, 'MISSING_CHAR', 'Comments must be separated from other tokens by white space characters')
          const _ = g.substring(1) || ' '
          ;(c ? (c += d + _) : (c = _), (d = ''))
          break
        }
        case 'newline':
          ;(c && (d += g), (f = !0))
          break
        default:
          u(m, 'UNEXPECTED_TOKEN', `Unexpected ${p} at node end`)
      }
      l += g.length
    }
  }
  return { comment: c, offset: l }
}
const Mf = 'Block collections are not allowed within flow collections',
  Df = (s) => s && (s.type === 'block-map' || s.type === 'block-seq')
function G1({ composeNode: s, composeEmptyNode: l }, a, u, c, f) {
  const d = u.start.source === '{',
    m = d ? 'flow map' : 'flow sequence',
    g = (f == null ? void 0 : f.nodeClass) ?? (d ? Bt : ol),
    p = new g(a.schema)
  p.flow = !0
  const _ = a.atRoot
  ;(_ && (a.atRoot = !1), a.atKey && (a.atKey = !1))
  let S = u.offset + u.start.source.length
  for (let M = 0; M < u.items.length; ++M) {
    const K = u.items[M],
      { start: Z, key: I, sep: Y, value: L } = K,
      $ = Ya(Z, {
        flow: m,
        indicator: 'explicit-key-ind',
        next: I ?? (Y == null ? void 0 : Y[0]),
        offset: S,
        onError: c,
        parentIndent: u.indent,
        startOnNewline: !1,
      })
    if (!$.found) {
      if (!$.anchor && !$.tag && !Y && !L) {
        ;(M === 0 && $.comma
          ? c($.comma, 'UNEXPECTED_TOKEN', `Unexpected , in ${m}`)
          : M < u.items.length - 1 && c($.start, 'UNEXPECTED_TOKEN', `Unexpected empty item in ${m}`),
          $.comment &&
            (p.comment
              ? (p.comment +=
                  `
` + $.comment)
              : (p.comment = $.comment)),
          (S = $.end))
        continue
      }
      !d &&
        a.options.strict &&
        Wi(I) &&
        c(I, 'MULTILINE_IMPLICIT_KEY', 'Implicit keys of flow sequence pairs need to be on a single line')
    }
    if (M === 0) $.comma && c($.comma, 'UNEXPECTED_TOKEN', `Unexpected , in ${m}`)
    else if (($.comma || c($.start, 'MISSING_CHAR', `Missing , between ${m} items`), $.comment)) {
      let X = ''
      e: for (const G of Z)
        switch (G.type) {
          case 'comma':
          case 'space':
            break
          case 'comment':
            X = G.source.substring(1)
            break e
          default:
            break e
        }
      if (X) {
        let G = p.items[p.items.length - 1]
        ;(Ye(G) && (G = G.value ?? G.key),
          G.comment
            ? (G.comment +=
                `
` + X)
            : (G.comment = X),
          ($.comment = $.comment.substring(X.length + 1)))
      }
    }
    if (!d && !Y && !$.found) {
      const X = L ? s(a, L, $, c) : l(a, $.end, Y, null, $, c)
      ;(p.items.push(X), (S = X.range[2]), Df(L) && c(X.range, 'BLOCK_IN_FLOW', Mf))
    } else {
      a.atKey = !0
      const X = $.end,
        G = I ? s(a, I, $, c) : l(a, X, Z, null, $, c)
      ;(Df(I) && c(G.range, 'BLOCK_IN_FLOW', Mf), (a.atKey = !1))
      const ce = Ya(Y ?? [], {
        flow: m,
        indicator: 'map-value-ind',
        next: L,
        offset: G.range[2],
        onError: c,
        parentIndent: u.indent,
        startOnNewline: !1,
      })
      if (ce.found) {
        if (!d && !$.found && a.options.strict) {
          if (Y)
            for (const F of Y) {
              if (F === ce.found) break
              if (F.type === 'newline') {
                c(F, 'MULTILINE_IMPLICIT_KEY', 'Implicit keys of flow sequence pairs need to be on a single line')
                break
              }
            }
          $.start < ce.found.offset - 1024 &&
            c(
              ce.found,
              'KEY_OVER_1024_CHARS',
              'The : indicator must be at most 1024 chars after the start of an implicit flow sequence key'
            )
        }
      } else
        L &&
          ('source' in L && L.source && L.source[0] === ':'
            ? c(L, 'MISSING_CHAR', `Missing space after : in ${m}`)
            : c(ce.start, 'MISSING_CHAR', `Missing , or : between ${m} items`))
      const We = L ? s(a, L, ce, c) : ce.found ? l(a, ce.end, Y, null, ce, c) : null
      We
        ? Df(L) && c(We.range, 'BLOCK_IN_FLOW', Mf)
        : ce.comment &&
          (G.comment
            ? (G.comment +=
                `
` + ce.comment)
            : (G.comment = ce.comment))
      const Ke = new dt(G, We)
      if ((a.options.keepSourceTokens && (Ke.srcToken = K), d)) {
        const F = p
        ;(Wp(a, F.items, G) && c(X, 'DUPLICATE_KEY', 'Map keys must be unique'), F.items.push(Ke))
      } else {
        const F = new Bt(a.schema)
        ;((F.flow = !0), F.items.push(Ke))
        const Me = (We ?? G).range
        ;((F.range = [G.range[0], Me[1], Me[2]]), p.items.push(F))
      }
      S = We ? We.range[2] : ce.end
    }
  }
  const O = d ? '}' : ']',
    [E, ...U] = u.end
  let A = S
  if (E && E.source === O) A = E.offset + E.source.length
  else {
    const M = m[0].toUpperCase() + m.substring(1),
      K = _ ? `${M} must end with a ${O}` : `${M} in block collection must be sufficiently indented and end with a ${O}`
    ;(c(S, _ ? 'MISSING_CHAR' : 'BAD_INDENT', K), E && E.source.length !== 1 && U.unshift(E))
  }
  if (U.length > 0) {
    const M = ns(U, A, a.options.strict, c)
    ;(M.comment &&
      (p.comment
        ? (p.comment +=
            `
` + M.comment)
        : (p.comment = M.comment)),
      (p.range = [u.offset, A, M.offset]))
  } else p.range = [u.offset, A, A]
  return p
}
function zf(s, l, a, u, c, f) {
  const d = a.type === 'block-map' ? V1(s, l, a, u, f) : a.type === 'block-seq' ? K1(s, l, a, u, f) : G1(s, l, a, u, f),
    m = d.constructor
  return c === '!' || c === m.tagName ? ((d.tag = m.tagName), d) : (c && (d.tag = c), d)
}
function $1(s, l, a, u, c) {
  var O
  const f = u.tag,
    d = f ? l.directives.tagName(f.source, (E) => c(f, 'TAG_RESOLVE_FAILED', E)) : null
  if (a.type === 'block-seq') {
    const { anchor: E, newlineAfterProp: U } = u,
      A = E && f ? (E.offset > f.offset ? E : f) : (E ?? f)
    A && (!U || U.offset < A.offset) && c(A, 'MISSING_CHAR', 'Missing newline after block sequence props')
  }
  const m = a.type === 'block-map' ? 'map' : a.type === 'block-seq' ? 'seq' : a.start.source === '{' ? 'map' : 'seq'
  if (!f || !d || d === '!' || (d === Bt.tagName && m === 'map') || (d === ol.tagName && m === 'seq'))
    return zf(s, l, a, c, d)
  let g = l.schema.tags.find((E) => E.tag === d && E.collection === m)
  if (!g) {
    const E = l.schema.knownTags[d]
    if (E && E.collection === m) (l.schema.tags.push(Object.assign({}, E, { default: !1 })), (g = E))
    else
      return (
        E
          ? c(
              f,
              'BAD_COLLECTION_TYPE',
              `${E.tag} used for ${m} collection, but expects ${E.collection ?? 'scalar'}`,
              !0
            )
          : c(f, 'TAG_RESOLVE_FAILED', `Unresolved tag: ${d}`, !0),
        zf(s, l, a, c, d)
      )
  }
  const p = zf(s, l, a, c, d, g),
    _ = ((O = g.resolve) == null ? void 0 : O.call(g, p, (E) => c(f, 'TAG_RESOLVE_FAILED', E), l.options)) ?? p,
    S = Ve(_) ? _ : new de(_)
  return ((S.range = p.range), (S.tag = d), g != null && g.format && (S.format = g.format), S)
}
function Fp(s, l, a) {
  const u = l.offset,
    c = Q1(l, s.options.strict, a)
  if (!c) return { value: '', type: null, comment: '', range: [u, u, u] }
  const f = c.mode === '>' ? de.BLOCK_FOLDED : de.BLOCK_LITERAL,
    d = l.source ? X1(l.source) : []
  let m = d.length
  for (let A = d.length - 1; A >= 0; --A) {
    const M = d[A][1]
    if (M === '' || M === '\r') m = A
    else break
  }
  if (m === 0) {
    const A =
      c.chomp === '+' && d.length > 0
        ? `
`.repeat(Math.max(1, d.length - 1))
        : ''
    let M = u + c.length
    return (l.source && (M += l.source.length), { value: A, type: f, comment: c.comment, range: [u, M, M] })
  }
  let g = l.indent + c.indent,
    p = l.offset + c.length,
    _ = 0
  for (let A = 0; A < m; ++A) {
    const [M, K] = d[A]
    if (K === '' || K === '\r') c.indent === 0 && M.length > g && (g = M.length)
    else {
      ;(M.length < g &&
        a(
          p + M.length,
          'MISSING_CHAR',
          'Block scalars with more-indented leading empty lines must use an explicit indentation indicator'
        ),
        c.indent === 0 && (g = M.length),
        (_ = A),
        g === 0 && !s.atRoot && a(p, 'BAD_INDENT', 'Block scalar values in collections must be indented'))
      break
    }
    p += M.length + K.length + 1
  }
  for (let A = d.length - 1; A >= m; --A) d[A][0].length > g && (m = A + 1)
  let S = '',
    O = '',
    E = !1
  for (let A = 0; A < _; ++A)
    S +=
      d[A][0].slice(g) +
      `
`
  for (let A = _; A < m; ++A) {
    let [M, K] = d[A]
    p += M.length + K.length + 1
    const Z = K[K.length - 1] === '\r'
    if ((Z && (K = K.slice(0, -1)), K && M.length < g)) {
      const Y = `Block scalar lines must not be less indented than their ${c.indent ? 'explicit indentation indicator' : 'first line'}`
      ;(a(p - K.length - (Z ? 2 : 1), 'BAD_INDENT', Y), (M = ''))
    }
    f === de.BLOCK_LITERAL
      ? ((S += O + M.slice(g) + K),
        (O = `
`))
      : M.length > g || K[0] === '	'
        ? (O === ' '
            ? (O = `
`)
            : !E &&
              O ===
                `
` &&
              (O = `

`),
          (S += O + M.slice(g) + K),
          (O = `
`),
          (E = !0))
        : K === ''
          ? O ===
            `
`
            ? (S += `
`)
            : (O = `
`)
          : ((S += O + K), (O = ' '), (E = !1))
  }
  switch (c.chomp) {
    case '-':
      break
    case '+':
      for (let A = m; A < d.length; ++A)
        S +=
          `
` + d[A][0].slice(g)
      S[S.length - 1] !==
        `
` &&
        (S += `
`)
      break
    default:
      S += `
`
  }
  const U = u + c.length + l.source.length
  return { value: S, type: f, comment: c.comment, range: [u, U, U] }
}
function Q1({ offset: s, props: l }, a, u) {
  if (l[0].type !== 'block-scalar-header') return (u(l[0], 'IMPOSSIBLE', 'Block scalar header not found'), null)
  const { source: c } = l[0],
    f = c[0]
  let d = 0,
    m = '',
    g = -1
  for (let O = 1; O < c.length; ++O) {
    const E = c[O]
    if (!m && (E === '-' || E === '+')) m = E
    else {
      const U = Number(E)
      !d && U ? (d = U) : g === -1 && (g = s + O)
    }
  }
  g !== -1 && u(g, 'UNEXPECTED_TOKEN', `Block scalar header includes extra characters: ${c}`)
  let p = !1,
    _ = '',
    S = c.length
  for (let O = 1; O < l.length; ++O) {
    const E = l[O]
    switch (E.type) {
      case 'space':
        p = !0
      case 'newline':
        S += E.source.length
        break
      case 'comment':
        ;(a && !p && u(E, 'MISSING_CHAR', 'Comments must be separated from other tokens by white space characters'),
          (S += E.source.length),
          (_ = E.source.substring(1)))
        break
      case 'error':
        ;(u(E, 'UNEXPECTED_TOKEN', E.message), (S += E.source.length))
        break
      default: {
        const U = `Unexpected token in block scalar header: ${E.type}`
        u(E, 'UNEXPECTED_TOKEN', U)
        const A = E.source
        A && typeof A == 'string' && (S += A.length)
      }
    }
  }
  return { mode: f, indent: d, chomp: m, comment: _, length: S }
}
function X1(s) {
  const l = s.split(/\n( *)/),
    a = l[0],
    u = a.match(/^( *)/),
    f = [u != null && u[1] ? [u[1], a.slice(u[1].length)] : ['', a]]
  for (let d = 1; d < l.length; d += 2) f.push([l[d], l[d + 1]])
  return f
}
function Pp(s, l, a) {
  const { offset: u, type: c, source: f, end: d } = s
  let m, g
  const p = (O, E, U) => a(u + O, E, U)
  switch (c) {
    case 'scalar':
      ;((m = de.PLAIN), (g = J1(f, p)))
      break
    case 'single-quoted-scalar':
      ;((m = de.QUOTE_SINGLE), (g = I1(f, p)))
      break
    case 'double-quoted-scalar':
      ;((m = de.QUOTE_DOUBLE), (g = W1(f, p)))
      break
    default:
      return (
        a(s, 'UNEXPECTED_TOKEN', `Expected a flow scalar value, but found: ${c}`),
        { value: '', type: null, comment: '', range: [u, u + f.length, u + f.length] }
      )
  }
  const _ = u + f.length,
    S = ns(d, _, l, a)
  return { value: g, type: m, comment: S.comment, range: [u, _, S.offset] }
}
function J1(s, l) {
  let a = ''
  switch (s[0]) {
    case '	':
      a = 'a tab character'
      break
    case ',':
      a = 'flow indicator character ,'
      break
    case '%':
      a = 'directive indicator character %'
      break
    case '|':
    case '>': {
      a = `block scalar indicator ${s[0]}`
      break
    }
    case '@':
    case '`': {
      a = `reserved character ${s[0]}`
      break
    }
  }
  return (a && l(0, 'BAD_SCALAR_START', `Plain value cannot start with ${a}`), eg(s))
}
function I1(s, l) {
  return (
    (s[s.length - 1] !== "'" || s.length === 1) && l(s.length, 'MISSING_CHAR', "Missing closing 'quote"),
    eg(s.slice(1, -1)).replace(/''/g, "'")
  )
}
function eg(s) {
  let l, a
  try {
    ;((l = new RegExp(
      `(.*?)(?<![ 	])[ 	]*\r?
`,
      'sy'
    )),
      (a = new RegExp(
        `[ 	]*(.*?)(?:(?<![ 	])[ 	]*)?\r?
`,
        'sy'
      )))
  } catch {
    ;((l = /(.*?)[ \t]*\r?\n/sy), (a = /[ \t]*(.*?)[ \t]*\r?\n/sy))
  }
  let u = l.exec(s)
  if (!u) return s
  let c = u[1],
    f = ' ',
    d = l.lastIndex
  for (a.lastIndex = d; (u = a.exec(s)); )
    (u[1] === ''
      ? f ===
        `
`
        ? (c += f)
        : (f = `
`)
      : ((c += f + u[1]), (f = ' ')),
      (d = a.lastIndex))
  const m = /[ \t]*(.*)/sy
  return ((m.lastIndex = d), (u = m.exec(s)), c + f + ((u == null ? void 0 : u[1]) ?? ''))
}
function W1(s, l) {
  let a = ''
  for (let u = 1; u < s.length - 1; ++u) {
    const c = s[u]
    if (
      !(
        c === '\r' &&
        s[u + 1] ===
          `
`
      )
    )
      if (
        c ===
        `
`
      ) {
        const { fold: f, offset: d } = F1(s, u)
        ;((a += f), (u = d))
      } else if (c === '\\') {
        let f = s[++u]
        const d = P1[f]
        if (d) a += d
        else if (
          f ===
          `
`
        )
          for (f = s[u + 1]; f === ' ' || f === '	'; ) f = s[++u + 1]
        else if (
          f === '\r' &&
          s[u + 1] ===
            `
`
        )
          for (f = s[++u + 1]; f === ' ' || f === '	'; ) f = s[++u + 1]
        else if (f === 'x' || f === 'u' || f === 'U') {
          const m = { x: 2, u: 4, U: 8 }[f]
          ;((a += eS(s, u + 1, m, l)), (u += m))
        } else {
          const m = s.substr(u - 1, 2)
          ;(l(u - 1, 'BAD_DQ_ESCAPE', `Invalid escape sequence ${m}`), (a += m))
        }
      } else if (c === ' ' || c === '	') {
        const f = u
        let d = s[u + 1]
        for (; d === ' ' || d === '	'; ) d = s[++u + 1]
        d !==
          `
` &&
          !(
            d === '\r' &&
            s[u + 2] ===
              `
`
          ) &&
          (a += u > f ? s.slice(f, u + 1) : c)
      } else a += c
  }
  return ((s[s.length - 1] !== '"' || s.length === 1) && l(s.length, 'MISSING_CHAR', 'Missing closing "quote'), a)
}
function F1(s, l) {
  let a = '',
    u = s[l + 1]
  for (
    ;
    (u === ' ' ||
      u === '	' ||
      u ===
        `
` ||
      u === '\r') &&
    !(
      u === '\r' &&
      s[l + 2] !==
        `
`
    );

  )
    (u ===
      `
` &&
      (a += `
`),
      (l += 1),
      (u = s[l + 1]))
  return (a || (a = ' '), { fold: a, offset: l })
}
const P1 = {
  '0': '\0',
  'a': '\x07',
  'b': '\b',
  'e': '\x1B',
  'f': '\f',
  'n': `
`,
  'r': '\r',
  't': '	',
  'v': '\v',
  'N': '',
  '_': ' ',
  'L': '\u2028',
  'P': '\u2029',
  ' ': ' ',
  '"': '"',
  '/': '/',
  '\\': '\\',
  '	': '	',
}
function eS(s, l, a, u) {
  const c = s.substr(l, a),
    d = c.length === a && /^[0-9a-fA-F]+$/.test(c) ? parseInt(c, 16) : NaN
  if (isNaN(d)) {
    const m = s.substr(l - 2, a + 2)
    return (u(l - 2, 'BAD_DQ_ESCAPE', `Invalid escape sequence ${m}`), m)
  }
  return String.fromCodePoint(d)
}
function tg(s, l, a, u) {
  const {
      value: c,
      type: f,
      comment: d,
      range: m,
    } = l.type === 'block-scalar' ? Fp(s, l, u) : Pp(l, s.options.strict, u),
    g = a ? s.directives.tagName(a.source, (S) => u(a, 'TAG_RESOLVE_FAILED', S)) : null
  let p
  s.options.stringKeys && s.atKey
    ? (p = s.schema[on])
    : g
      ? (p = tS(s.schema, c, g, a, u))
      : l.type === 'scalar'
        ? (p = nS(s, c, l, u))
        : (p = s.schema[on])
  let _
  try {
    const S = p.resolve(c, (O) => u(a ?? l, 'TAG_RESOLVE_FAILED', O), s.options)
    _ = Ue(S) ? S : new de(S)
  } catch (S) {
    const O = S instanceof Error ? S.message : String(S)
    ;(u(a ?? l, 'TAG_RESOLVE_FAILED', O), (_ = new de(c)))
  }
  return (
    (_.range = m),
    (_.source = c),
    f && (_.type = f),
    g && (_.tag = g),
    p.format && (_.format = p.format),
    d && (_.comment = d),
    _
  )
}
function tS(s, l, a, u, c) {
  var m
  if (a === '!') return s[on]
  const f = []
  for (const g of s.tags)
    if (!g.collection && g.tag === a)
      if (g.default && g.test) f.push(g)
      else return g
  for (const g of f) if ((m = g.test) != null && m.test(l)) return g
  const d = s.knownTags[a]
  return d && !d.collection
    ? (s.tags.push(Object.assign({}, d, { default: !1, test: void 0 })), d)
    : (c(u, 'TAG_RESOLVE_FAILED', `Unresolved tag: ${a}`, a !== 'tag:yaml.org,2002:str'), s[on])
}
function nS({ atKey: s, directives: l, schema: a }, u, c, f) {
  const d =
    a.tags.find((m) => {
      var g
      return (m.default === !0 || (s && m.default === 'key')) && ((g = m.test) == null ? void 0 : g.test(u))
    }) || a[on]
  if (a.compat) {
    const m =
      a.compat.find((g) => {
        var p
        return g.default && ((p = g.test) == null ? void 0 : p.test(u))
      }) ?? a[on]
    if (d.tag !== m.tag) {
      const g = l.tagString(d.tag),
        p = l.tagString(m.tag),
        _ = `Value may be parsed as either ${g} or ${p}`
      f(c, 'TAG_RESOLVE_FAILED', _, !0)
    }
  }
  return d
}
function lS(s, l, a) {
  if (l) {
    a ?? (a = l.length)
    for (let u = a - 1; u >= 0; --u) {
      let c = l[u]
      switch (c.type) {
        case 'space':
        case 'comment':
        case 'newline':
          s -= c.source.length
          continue
      }
      for (c = l[++u]; (c == null ? void 0 : c.type) === 'space'; ) ((s += c.source.length), (c = l[++u]))
      break
    }
  }
  return s
}
const aS = { composeNode: ng, composeEmptyNode: So }
function ng(s, l, a, u) {
  const c = s.atKey,
    { spaceBefore: f, comment: d, anchor: m, tag: g } = a
  let p,
    _ = !0
  switch (l.type) {
    case 'alias':
      ;((p = iS(s, l, u)), (m || g) && u(l, 'ALIAS_PROPS', 'An alias node must not specify any properties'))
      break
    case 'scalar':
    case 'single-quoted-scalar':
    case 'double-quoted-scalar':
    case 'block-scalar':
      ;((p = tg(s, l, g, u)), m && (p.anchor = m.source.substring(1)))
      break
    case 'block-map':
    case 'block-seq':
    case 'flow-collection':
      ;((p = $1(aS, s, l, a, u)), m && (p.anchor = m.source.substring(1)))
      break
    default: {
      const S = l.type === 'error' ? l.message : `Unsupported token (type: ${l.type})`
      ;(u(l, 'UNEXPECTED_TOKEN', S), (p = So(s, l.offset, void 0, null, a, u)), (_ = !1))
    }
  }
  return (
    m && p.anchor === '' && u(m, 'BAD_ALIAS', 'Anchor cannot be an empty string'),
    c &&
      s.options.stringKeys &&
      (!Ue(p) || typeof p.value != 'string' || (p.tag && p.tag !== 'tag:yaml.org,2002:str')) &&
      u(g ?? l, 'NON_STRING_KEY', 'With stringKeys, all keys must be strings'),
    f && (p.spaceBefore = !0),
    d && (l.type === 'scalar' && l.source === '' ? (p.comment = d) : (p.commentBefore = d)),
    s.options.keepSourceTokens && _ && (p.srcToken = l),
    p
  )
}
function So(s, l, a, u, { spaceBefore: c, comment: f, anchor: d, tag: m, end: g }, p) {
  const _ = { type: 'scalar', offset: lS(l, a, u), indent: -1, source: '' },
    S = tg(s, _, m, p)
  return (
    d && ((S.anchor = d.source.substring(1)), S.anchor === '' && p(d, 'BAD_ALIAS', 'Anchor cannot be an empty string')),
    c && (S.spaceBefore = !0),
    f && ((S.comment = f), (S.range[2] = g)),
    S
  )
}
function iS({ options: s }, { offset: l, source: a, end: u }, c) {
  const f = new Zu(a.substring(1))
  ;(f.source === '' && c(l, 'BAD_ALIAS', 'Alias cannot be an empty string'),
    f.source.endsWith(':') && c(l + a.length - 1, 'BAD_ALIAS', 'Alias ending in : is ambiguous', !0))
  const d = l + a.length,
    m = ns(u, d, s.strict, c)
  return ((f.range = [l, d, m.offset]), m.comment && (f.comment = m.comment), f)
}
function sS(s, l, { offset: a, start: u, value: c, end: f }, d) {
  const m = Object.assign({ _directives: l }, s),
    g = new Qa(void 0, m),
    p = { atKey: !1, atRoot: !0, directives: g.directives, options: g.options, schema: g.schema },
    _ = Ya(u, {
      indicator: 'doc-start',
      next: c ?? (f == null ? void 0 : f[0]),
      offset: a,
      onError: d,
      parentIndent: 0,
      startOnNewline: !0,
    })
  ;(_.found &&
    ((g.directives.docStart = !0),
    c &&
      (c.type === 'block-map' || c.type === 'block-seq') &&
      !_.hasNewline &&
      d(_.end, 'MISSING_CHAR', 'Block collection cannot start on same line with directives-end marker')),
    (g.contents = c ? ng(p, c, _, d) : So(p, _.end, u, null, _, d)))
  const S = g.contents.range[2],
    O = ns(f, S, !1, d)
  return (O.comment && (g.comment = O.comment), (g.range = [a, S, O.offset]), g)
}
function Vi(s) {
  if (typeof s == 'number') return [s, s + 1]
  if (Array.isArray(s)) return s.length === 2 ? s : [s[0], s[1]]
  const { offset: l, source: a } = s
  return [l, l + (typeof a == 'string' ? a.length : 1)]
}
function ap(s) {
  var c
  let l = '',
    a = !1,
    u = !1
  for (let f = 0; f < s.length; ++f) {
    const d = s[f]
    switch (d[0]) {
      case '#':
        ;((l +=
          (l === ''
            ? ''
            : u
              ? `

`
              : `
`) + (d.substring(1) || ' ')),
          (a = !0),
          (u = !1))
        break
      case '%':
        ;(((c = s[f + 1]) == null ? void 0 : c[0]) !== '#' && (f += 1), (a = !1))
        break
      default:
        ;(a || (u = !0), (a = !1))
    }
  }
  return { comment: l, afterEmptyLine: u }
}
class _o {
  constructor(l = {}) {
    ;((this.doc = null),
      (this.atDirectives = !1),
      (this.prelude = []),
      (this.errors = []),
      (this.warnings = []),
      (this.onError = (a, u, c, f) => {
        const d = Vi(a)
        f ? this.warnings.push(new Ip(d, u, c)) : this.errors.push(new Ll(d, u, c))
      }),
      (this.directives = new pt({ version: l.version || '1.2' })),
      (this.options = l))
  }
  decorate(l, a) {
    const { comment: u, afterEmptyLine: c } = ap(this.prelude)
    if (u) {
      const f = l.contents
      if (a)
        l.comment = l.comment
          ? `${l.comment}
${u}`
          : u
      else if (c || l.directives.docStart || !f) l.commentBefore = u
      else if (Ze(f) && !f.flow && f.items.length > 0) {
        let d = f.items[0]
        Ye(d) && (d = d.key)
        const m = d.commentBefore
        d.commentBefore = m
          ? `${u}
${m}`
          : u
      } else {
        const d = f.commentBefore
        f.commentBefore = d
          ? `${u}
${d}`
          : u
      }
    }
    ;(a
      ? (Array.prototype.push.apply(l.errors, this.errors), Array.prototype.push.apply(l.warnings, this.warnings))
      : ((l.errors = this.errors), (l.warnings = this.warnings)),
      (this.prelude = []),
      (this.errors = []),
      (this.warnings = []))
  }
  streamInfo() {
    return {
      comment: ap(this.prelude).comment,
      directives: this.directives,
      errors: this.errors,
      warnings: this.warnings,
    }
  }
  *compose(l, a = !1, u = -1) {
    for (const c of l) yield* this.next(c)
    yield* this.end(a, u)
  }
  *next(l) {
    switch (l.type) {
      case 'directive':
        ;(this.directives.add(l.source, (a, u, c) => {
          const f = Vi(l)
          ;((f[0] += a), this.onError(f, 'BAD_DIRECTIVE', u, c))
        }),
          this.prelude.push(l.source),
          (this.atDirectives = !0))
        break
      case 'document': {
        const a = sS(this.options, this.directives, l, this.onError)
        ;(this.atDirectives &&
          !a.directives.docStart &&
          this.onError(l, 'MISSING_CHAR', 'Missing directives-end/doc-start indicator line'),
          this.decorate(a, !1),
          this.doc && (yield this.doc),
          (this.doc = a),
          (this.atDirectives = !1))
        break
      }
      case 'byte-order-mark':
      case 'space':
        break
      case 'comment':
      case 'newline':
        this.prelude.push(l.source)
        break
      case 'error': {
        const a = l.source ? `${l.message}: ${JSON.stringify(l.source)}` : l.message,
          u = new Ll(Vi(l), 'UNEXPECTED_TOKEN', a)
        this.atDirectives || !this.doc ? this.errors.push(u) : this.doc.errors.push(u)
        break
      }
      case 'doc-end': {
        if (!this.doc) {
          const u = 'Unexpected doc-end without preceding document'
          this.errors.push(new Ll(Vi(l), 'UNEXPECTED_TOKEN', u))
          break
        }
        this.doc.directives.docEnd = !0
        const a = ns(l.end, l.offset + l.source.length, this.doc.options.strict, this.onError)
        if ((this.decorate(this.doc, !0), a.comment)) {
          const u = this.doc.comment
          this.doc.comment = u
            ? `${u}
${a.comment}`
            : a.comment
        }
        this.doc.range[2] = a.offset
        break
      }
      default:
        this.errors.push(new Ll(Vi(l), 'UNEXPECTED_TOKEN', `Unsupported token ${l.type}`))
    }
  }
  *end(l = !1, a = -1) {
    if (this.doc) (this.decorate(this.doc, !0), yield this.doc, (this.doc = null))
    else if (l) {
      const u = Object.assign({ _directives: this.directives }, this.options),
        c = new Qa(void 0, u)
      ;(this.atDirectives && this.onError(a, 'MISSING_CHAR', 'Missing directives-end indicator line'),
        (c.range = [0, a, a]),
        this.decorate(c, !1),
        yield c)
    }
  }
}
function uS(s, l = !0, a) {
  if (s) {
    const u = (c, f, d) => {
      const m = typeof c == 'number' ? c : Array.isArray(c) ? c[0] : c.offset
      if (a) a(m, f, d)
      else throw new Ll([m, m + 1], f, d)
    }
    switch (s.type) {
      case 'scalar':
      case 'single-quoted-scalar':
      case 'double-quoted-scalar':
        return Pp(s, l, u)
      case 'block-scalar':
        return Fp({ options: { strict: l } }, s, u)
    }
  }
  return null
}
function cS(s, l) {
  const { implicitKey: a = !1, indent: u, inFlow: c = !1, offset: f = -1, type: d = 'PLAIN' } = l,
    m = es(
      { type: d, value: s },
      { implicitKey: a, indent: u > 0 ? ' '.repeat(u) : '', inFlow: c, options: { blockQuote: !0, lineWidth: -1 } }
    ),
    g = l.end ?? [
      {
        type: 'newline',
        offset: -1,
        indent: u,
        source: `
`,
      },
    ]
  switch (m[0]) {
    case '|':
    case '>': {
      const p = m.indexOf(`
`),
        _ = m.substring(0, p),
        S =
          m.substring(p + 1) +
          `
`,
        O = [{ type: 'block-scalar-header', offset: f, indent: u, source: _ }]
      return (
        lg(O, g) ||
          O.push({
            type: 'newline',
            offset: -1,
            indent: u,
            source: `
`,
          }),
        { type: 'block-scalar', offset: f, indent: u, props: O, source: S }
      )
    }
    case '"':
      return { type: 'double-quoted-scalar', offset: f, indent: u, source: m, end: g }
    case "'":
      return { type: 'single-quoted-scalar', offset: f, indent: u, source: m, end: g }
    default:
      return { type: 'scalar', offset: f, indent: u, source: m, end: g }
  }
}
function rS(s, l, a = {}) {
  let { afterKey: u = !1, implicitKey: c = !1, inFlow: f = !1, type: d } = a,
    m = 'indent' in s ? s.indent : null
  if ((u && typeof m == 'number' && (m += 2), !d))
    switch (s.type) {
      case 'single-quoted-scalar':
        d = 'QUOTE_SINGLE'
        break
      case 'double-quoted-scalar':
        d = 'QUOTE_DOUBLE'
        break
      case 'block-scalar': {
        const p = s.props[0]
        if (p.type !== 'block-scalar-header') throw new Error('Invalid block scalar header')
        d = p.source[0] === '>' ? 'BLOCK_FOLDED' : 'BLOCK_LITERAL'
        break
      }
      default:
        d = 'PLAIN'
    }
  const g = es(
    { type: d, value: l },
    {
      implicitKey: c || m === null,
      indent: m !== null && m > 0 ? ' '.repeat(m) : '',
      inFlow: f,
      options: { blockQuote: !0, lineWidth: -1 },
    }
  )
  switch (g[0]) {
    case '|':
    case '>':
      fS(s, g)
      break
    case '"':
      Lf(s, g, 'double-quoted-scalar')
      break
    case "'":
      Lf(s, g, 'single-quoted-scalar')
      break
    default:
      Lf(s, g, 'scalar')
  }
}
function fS(s, l) {
  const a = l.indexOf(`
`),
    u = l.substring(0, a),
    c =
      l.substring(a + 1) +
      `
`
  if (s.type === 'block-scalar') {
    const f = s.props[0]
    if (f.type !== 'block-scalar-header') throw new Error('Invalid block scalar header')
    ;((f.source = u), (s.source = c))
  } else {
    const { offset: f } = s,
      d = 'indent' in s ? s.indent : -1,
      m = [{ type: 'block-scalar-header', offset: f, indent: d, source: u }]
    lg(m, 'end' in s ? s.end : void 0) ||
      m.push({
        type: 'newline',
        offset: -1,
        indent: d,
        source: `
`,
      })
    for (const g of Object.keys(s)) g !== 'type' && g !== 'offset' && delete s[g]
    Object.assign(s, { type: 'block-scalar', indent: d, props: m, source: c })
  }
}
function lg(s, l) {
  if (l)
    for (const a of l)
      switch (a.type) {
        case 'space':
        case 'comment':
          s.push(a)
          break
        case 'newline':
          return (s.push(a), !0)
      }
  return !1
}
function Lf(s, l, a) {
  switch (s.type) {
    case 'scalar':
    case 'double-quoted-scalar':
    case 'single-quoted-scalar':
      ;((s.type = a), (s.source = l))
      break
    case 'block-scalar': {
      const u = s.props.slice(1)
      let c = l.length
      s.props[0].type === 'block-scalar-header' && (c -= s.props[0].source.length)
      for (const f of u) f.offset += c
      ;(delete s.props, Object.assign(s, { type: a, source: l, end: u }))
      break
    }
    case 'block-map':
    case 'block-seq': {
      const c = {
        type: 'newline',
        offset: s.offset + l.length,
        indent: s.indent,
        source: `
`,
      }
      ;(delete s.items, Object.assign(s, { type: a, source: l, end: [c] }))
      break
    }
    default: {
      const u = 'indent' in s ? s.indent : -1,
        c =
          'end' in s && Array.isArray(s.end)
            ? s.end.filter((f) => f.type === 'space' || f.type === 'comment' || f.type === 'newline')
            : []
      for (const f of Object.keys(s)) f !== 'type' && f !== 'offset' && delete s[f]
      Object.assign(s, { type: a, indent: u, source: l, end: c })
    }
  }
}
const oS = (s) => ('type' in s ? qu(s) : wu(s))
function qu(s) {
  switch (s.type) {
    case 'block-scalar': {
      let l = ''
      for (const a of s.props) l += qu(a)
      return l + s.source
    }
    case 'block-map':
    case 'block-seq': {
      let l = ''
      for (const a of s.items) l += wu(a)
      return l
    }
    case 'flow-collection': {
      let l = s.start.source
      for (const a of s.items) l += wu(a)
      for (const a of s.end) l += a.source
      return l
    }
    case 'document': {
      let l = wu(s)
      if (s.end) for (const a of s.end) l += a.source
      return l
    }
    default: {
      let l = s.source
      if ('end' in s && s.end) for (const a of s.end) l += a.source
      return l
    }
  }
}
function wu({ start: s, key: l, sep: a, value: u }) {
  let c = ''
  for (const f of s) c += f.source
  if ((l && (c += qu(l)), a)) for (const f of a) c += f.source
  return (u && (c += qu(u)), c)
}
const Ff = Symbol('break visit'),
  dS = Symbol('skip children'),
  ag = Symbol('remove item')
function Ul(s, l) {
  ;('type' in s && s.type === 'document' && (s = { start: s.start, value: s.value }), ig(Object.freeze([]), s, l))
}
Ul.BREAK = Ff
Ul.SKIP = dS
Ul.REMOVE = ag
Ul.itemAtPath = (s, l) => {
  let a = s
  for (const [u, c] of l) {
    const f = a == null ? void 0 : a[u]
    if (f && 'items' in f) a = f.items[c]
    else return
  }
  return a
}
Ul.parentCollection = (s, l) => {
  const a = Ul.itemAtPath(s, l.slice(0, -1)),
    u = l[l.length - 1][0],
    c = a == null ? void 0 : a[u]
  if (c && 'items' in c) return c
  throw new Error('Parent collection not found')
}
function ig(s, l, a) {
  let u = a(l, s)
  if (typeof u == 'symbol') return u
  for (const c of ['key', 'value']) {
    const f = l[c]
    if (f && 'items' in f) {
      for (let d = 0; d < f.items.length; ++d) {
        const m = ig(Object.freeze(s.concat([[c, d]])), f.items[d], a)
        if (typeof m == 'number') d = m - 1
        else {
          if (m === Ff) return Ff
          m === ag && (f.items.splice(d, 1), (d -= 1))
        }
      }
      typeof u == 'function' && c === 'key' && (u = u(l, s))
    }
  }
  return typeof u == 'function' ? u(l, s) : u
}
const Fu = '\uFEFF',
  Pu = '',
  ec = '',
  Fi = '',
  hS = (s) => !!s && 'items' in s,
  mS = (s) =>
    !!s &&
    (s.type === 'scalar' ||
      s.type === 'single-quoted-scalar' ||
      s.type === 'double-quoted-scalar' ||
      s.type === 'block-scalar')
function yS(s) {
  switch (s) {
    case Fu:
      return '<BOM>'
    case Pu:
      return '<DOC>'
    case ec:
      return '<FLOW_END>'
    case Fi:
      return '<SCALAR>'
    default:
      return JSON.stringify(s)
  }
}
function sg(s) {
  switch (s) {
    case Fu:
      return 'byte-order-mark'
    case Pu:
      return 'doc-mode'
    case ec:
      return 'flow-error-end'
    case Fi:
      return 'scalar'
    case '---':
      return 'doc-start'
    case '...':
      return 'doc-end'
    case '':
    case `
`:
    case `\r
`:
      return 'newline'
    case '-':
      return 'seq-item-ind'
    case '?':
      return 'explicit-key-ind'
    case ':':
      return 'map-value-ind'
    case '{':
      return 'flow-map-start'
    case '}':
      return 'flow-map-end'
    case '[':
      return 'flow-seq-start'
    case ']':
      return 'flow-seq-end'
    case ',':
      return 'comma'
  }
  switch (s[0]) {
    case ' ':
    case '	':
      return 'space'
    case '#':
      return 'comment'
    case '%':
      return 'directive-line'
    case '*':
      return 'alias'
    case '&':
      return 'anchor'
    case '!':
      return 'tag'
    case "'":
      return 'single-quoted-scalar'
    case '"':
      return 'double-quoted-scalar'
    case '|':
    case '>':
      return 'block-scalar-header'
  }
  return null
}
const pS = Object.freeze(
  Object.defineProperty(
    {
      __proto__: null,
      BOM: Fu,
      DOCUMENT: Pu,
      FLOW_END: ec,
      SCALAR: Fi,
      createScalarToken: cS,
      isCollection: hS,
      isScalar: mS,
      prettyToken: yS,
      resolveAsScalar: uS,
      setScalarValue: rS,
      stringify: oS,
      tokenType: sg,
      visit: Ul,
    },
    Symbol.toStringTag,
    { value: 'Module' }
  )
)
function tn(s) {
  switch (s) {
    case void 0:
    case ' ':
    case `
`:
    case '\r':
    case '	':
      return !0
    default:
      return !1
  }
}
const ip = new Set('0123456789ABCDEFabcdef'),
  gS = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()"),
  xu = new Set(',[]{}'),
  vS = new Set(` ,[]{}
\r	`),
  Rf = (s) => !s || vS.has(s)
class ug {
  constructor() {
    ;((this.atEnd = !1),
      (this.blockScalarIndent = -1),
      (this.blockScalarKeep = !1),
      (this.buffer = ''),
      (this.flowKey = !1),
      (this.flowLevel = 0),
      (this.indentNext = 0),
      (this.indentValue = 0),
      (this.lineEndPos = null),
      (this.next = null),
      (this.pos = 0))
  }
  *lex(l, a = !1) {
    if (l) {
      if (typeof l != 'string') throw TypeError('source is not a string')
      ;((this.buffer = this.buffer ? this.buffer + l : l), (this.lineEndPos = null))
    }
    this.atEnd = !a
    let u = this.next ?? 'stream'
    for (; u && (a || this.hasChars(1)); ) u = yield* this.parseNext(u)
  }
  atLineEnd() {
    let l = this.pos,
      a = this.buffer[l]
    for (; a === ' ' || a === '	'; ) a = this.buffer[++l]
    return !a ||
      a === '#' ||
      a ===
        `
`
      ? !0
      : a === '\r'
        ? this.buffer[l + 1] ===
          `
`
        : !1
  }
  charAt(l) {
    return this.buffer[this.pos + l]
  }
  continueScalar(l) {
    let a = this.buffer[l]
    if (this.indentNext > 0) {
      let u = 0
      for (; a === ' '; ) a = this.buffer[++u + l]
      if (a === '\r') {
        const c = this.buffer[u + l + 1]
        if (
          c ===
            `
` ||
          (!c && !this.atEnd)
        )
          return l + u + 1
      }
      return a ===
        `
` ||
        u >= this.indentNext ||
        (!a && !this.atEnd)
        ? l + u
        : -1
    }
    if (a === '-' || a === '.') {
      const u = this.buffer.substr(l, 3)
      if ((u === '---' || u === '...') && tn(this.buffer[l + 3])) return -1
    }
    return l
  }
  getLine() {
    let l = this.lineEndPos
    return (
      (typeof l != 'number' || (l !== -1 && l < this.pos)) &&
        ((l = this.buffer.indexOf(
          `
`,
          this.pos
        )),
        (this.lineEndPos = l)),
      l === -1
        ? this.atEnd
          ? this.buffer.substring(this.pos)
          : null
        : (this.buffer[l - 1] === '\r' && (l -= 1), this.buffer.substring(this.pos, l))
    )
  }
  hasChars(l) {
    return this.pos + l <= this.buffer.length
  }
  setNext(l) {
    return (
      (this.buffer = this.buffer.substring(this.pos)),
      (this.pos = 0),
      (this.lineEndPos = null),
      (this.next = l),
      null
    )
  }
  peek(l) {
    return this.buffer.substr(this.pos, l)
  }
  *parseNext(l) {
    switch (l) {
      case 'stream':
        return yield* this.parseStream()
      case 'line-start':
        return yield* this.parseLineStart()
      case 'block-start':
        return yield* this.parseBlockStart()
      case 'doc':
        return yield* this.parseDocument()
      case 'flow':
        return yield* this.parseFlowCollection()
      case 'quoted-scalar':
        return yield* this.parseQuotedScalar()
      case 'block-scalar':
        return yield* this.parseBlockScalar()
      case 'plain-scalar':
        return yield* this.parsePlainScalar()
    }
  }
  *parseStream() {
    let l = this.getLine()
    if (l === null) return this.setNext('stream')
    if ((l[0] === Fu && (yield* this.pushCount(1), (l = l.substring(1))), l[0] === '%')) {
      let a = l.length,
        u = l.indexOf('#')
      for (; u !== -1; ) {
        const f = l[u - 1]
        if (f === ' ' || f === '	') {
          a = u - 1
          break
        } else u = l.indexOf('#', u + 1)
      }
      for (;;) {
        const f = l[a - 1]
        if (f === ' ' || f === '	') a -= 1
        else break
      }
      const c = (yield* this.pushCount(a)) + (yield* this.pushSpaces(!0))
      return (yield* this.pushCount(l.length - c), this.pushNewline(), 'stream')
    }
    if (this.atLineEnd()) {
      const a = yield* this.pushSpaces(!0)
      return (yield* this.pushCount(l.length - a), yield* this.pushNewline(), 'stream')
    }
    return (yield Pu, yield* this.parseLineStart())
  }
  *parseLineStart() {
    const l = this.charAt(0)
    if (!l && !this.atEnd) return this.setNext('line-start')
    if (l === '-' || l === '.') {
      if (!this.atEnd && !this.hasChars(4)) return this.setNext('line-start')
      const a = this.peek(3)
      if ((a === '---' || a === '...') && tn(this.charAt(3)))
        return (yield* this.pushCount(3), (this.indentValue = 0), (this.indentNext = 0), a === '---' ? 'doc' : 'stream')
    }
    return (
      (this.indentValue = yield* this.pushSpaces(!1)),
      this.indentNext > this.indentValue && !tn(this.charAt(1)) && (this.indentNext = this.indentValue),
      yield* this.parseBlockStart()
    )
  }
  *parseBlockStart() {
    const [l, a] = this.peek(2)
    if (!a && !this.atEnd) return this.setNext('block-start')
    if ((l === '-' || l === '?' || l === ':') && tn(a)) {
      const u = (yield* this.pushCount(1)) + (yield* this.pushSpaces(!0))
      return ((this.indentNext = this.indentValue + 1), (this.indentValue += u), yield* this.parseBlockStart())
    }
    return 'doc'
  }
  *parseDocument() {
    yield* this.pushSpaces(!0)
    const l = this.getLine()
    if (l === null) return this.setNext('doc')
    let a = yield* this.pushIndicators()
    switch (l[a]) {
      case '#':
        yield* this.pushCount(l.length - a)
      case void 0:
        return (yield* this.pushNewline(), yield* this.parseLineStart())
      case '{':
      case '[':
        return (yield* this.pushCount(1), (this.flowKey = !1), (this.flowLevel = 1), 'flow')
      case '}':
      case ']':
        return (yield* this.pushCount(1), 'doc')
      case '*':
        return (yield* this.pushUntil(Rf), 'doc')
      case '"':
      case "'":
        return yield* this.parseQuotedScalar()
      case '|':
      case '>':
        return (
          (a += yield* this.parseBlockScalarHeader()),
          (a += yield* this.pushSpaces(!0)),
          yield* this.pushCount(l.length - a),
          yield* this.pushNewline(),
          yield* this.parseBlockScalar()
        )
      default:
        return yield* this.parsePlainScalar()
    }
  }
  *parseFlowCollection() {
    let l,
      a,
      u = -1
    do
      ((l = yield* this.pushNewline()),
        l > 0 ? ((a = yield* this.pushSpaces(!1)), (this.indentValue = u = a)) : (a = 0),
        (a += yield* this.pushSpaces(!0)))
    while (l + a > 0)
    const c = this.getLine()
    if (c === null) return this.setNext('flow')
    if (
      ((u !== -1 && u < this.indentNext && c[0] !== '#') ||
        (u === 0 && (c.startsWith('---') || c.startsWith('...')) && tn(c[3]))) &&
      !(u === this.indentNext - 1 && this.flowLevel === 1 && (c[0] === ']' || c[0] === '}'))
    )
      return ((this.flowLevel = 0), yield ec, yield* this.parseLineStart())
    let f = 0
    for (; c[f] === ','; ) ((f += yield* this.pushCount(1)), (f += yield* this.pushSpaces(!0)), (this.flowKey = !1))
    switch (((f += yield* this.pushIndicators()), c[f])) {
      case void 0:
        return 'flow'
      case '#':
        return (yield* this.pushCount(c.length - f), 'flow')
      case '{':
      case '[':
        return (yield* this.pushCount(1), (this.flowKey = !1), (this.flowLevel += 1), 'flow')
      case '}':
      case ']':
        return (yield* this.pushCount(1), (this.flowKey = !0), (this.flowLevel -= 1), this.flowLevel ? 'flow' : 'doc')
      case '*':
        return (yield* this.pushUntil(Rf), 'flow')
      case '"':
      case "'":
        return ((this.flowKey = !0), yield* this.parseQuotedScalar())
      case ':': {
        const d = this.charAt(1)
        if (this.flowKey || tn(d) || d === ',')
          return ((this.flowKey = !1), yield* this.pushCount(1), yield* this.pushSpaces(!0), 'flow')
      }
      default:
        return ((this.flowKey = !1), yield* this.parsePlainScalar())
    }
  }
  *parseQuotedScalar() {
    const l = this.charAt(0)
    let a = this.buffer.indexOf(l, this.pos + 1)
    if (l === "'") for (; a !== -1 && this.buffer[a + 1] === "'"; ) a = this.buffer.indexOf("'", a + 2)
    else
      for (; a !== -1; ) {
        let f = 0
        for (; this.buffer[a - 1 - f] === '\\'; ) f += 1
        if (f % 2 === 0) break
        a = this.buffer.indexOf('"', a + 1)
      }
    const u = this.buffer.substring(0, a)
    let c = u.indexOf(
      `
`,
      this.pos
    )
    if (c !== -1) {
      for (; c !== -1; ) {
        const f = this.continueScalar(c + 1)
        if (f === -1) break
        c = u.indexOf(
          `
`,
          f
        )
      }
      c !== -1 && (a = c - (u[c - 1] === '\r' ? 2 : 1))
    }
    if (a === -1) {
      if (!this.atEnd) return this.setNext('quoted-scalar')
      a = this.buffer.length
    }
    return (yield* this.pushToIndex(a + 1, !1), this.flowLevel ? 'flow' : 'doc')
  }
  *parseBlockScalarHeader() {
    ;((this.blockScalarIndent = -1), (this.blockScalarKeep = !1))
    let l = this.pos
    for (;;) {
      const a = this.buffer[++l]
      if (a === '+') this.blockScalarKeep = !0
      else if (a > '0' && a <= '9') this.blockScalarIndent = Number(a) - 1
      else if (a !== '-') break
    }
    return yield* this.pushUntil((a) => tn(a) || a === '#')
  }
  *parseBlockScalar() {
    let l = this.pos - 1,
      a = 0,
      u
    e: for (let f = this.pos; (u = this.buffer[f]); ++f)
      switch (u) {
        case ' ':
          a += 1
          break
        case `
`:
          ;((l = f), (a = 0))
          break
        case '\r': {
          const d = this.buffer[f + 1]
          if (!d && !this.atEnd) return this.setNext('block-scalar')
          if (
            d ===
            `
`
          )
            break
        }
        default:
          break e
      }
    if (!u && !this.atEnd) return this.setNext('block-scalar')
    if (a >= this.indentNext) {
      this.blockScalarIndent === -1
        ? (this.indentNext = a)
        : (this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext))
      do {
        const f = this.continueScalar(l + 1)
        if (f === -1) break
        l = this.buffer.indexOf(
          `
`,
          f
        )
      } while (l !== -1)
      if (l === -1) {
        if (!this.atEnd) return this.setNext('block-scalar')
        l = this.buffer.length
      }
    }
    let c = l + 1
    for (u = this.buffer[c]; u === ' '; ) u = this.buffer[++c]
    if (u === '	') {
      for (
        ;
        u === '	' ||
        u === ' ' ||
        u === '\r' ||
        u ===
          `
`;

      )
        u = this.buffer[++c]
      l = c - 1
    } else if (!this.blockScalarKeep)
      do {
        let f = l - 1,
          d = this.buffer[f]
        d === '\r' && (d = this.buffer[--f])
        const m = f
        for (; d === ' '; ) d = this.buffer[--f]
        if (
          d ===
            `
` &&
          f >= this.pos &&
          f + 1 + a > m
        )
          l = f
        else break
      } while (!0)
    return (yield Fi, yield* this.pushToIndex(l + 1, !0), yield* this.parseLineStart())
  }
  *parsePlainScalar() {
    const l = this.flowLevel > 0
    let a = this.pos - 1,
      u = this.pos - 1,
      c
    for (; (c = this.buffer[++u]); )
      if (c === ':') {
        const f = this.buffer[u + 1]
        if (tn(f) || (l && xu.has(f))) break
        a = u
      } else if (tn(c)) {
        let f = this.buffer[u + 1]
        if (
          (c === '\r' &&
            (f ===
            `
`
              ? ((u += 1),
                (c = `
`),
                (f = this.buffer[u + 1]))
              : (a = u)),
          f === '#' || (l && xu.has(f)))
        )
          break
        if (
          c ===
          `
`
        ) {
          const d = this.continueScalar(u + 1)
          if (d === -1) break
          u = Math.max(u, d - 2)
        }
      } else {
        if (l && xu.has(c)) break
        a = u
      }
    return !c && !this.atEnd
      ? this.setNext('plain-scalar')
      : (yield Fi, yield* this.pushToIndex(a + 1, !0), l ? 'flow' : 'doc')
  }
  *pushCount(l) {
    return l > 0 ? (yield this.buffer.substr(this.pos, l), (this.pos += l), l) : 0
  }
  *pushToIndex(l, a) {
    const u = this.buffer.slice(this.pos, l)
    return u ? (yield u, (this.pos += u.length), u.length) : (a && (yield ''), 0)
  }
  *pushIndicators() {
    switch (this.charAt(0)) {
      case '!':
        return (yield* this.pushTag()) + (yield* this.pushSpaces(!0)) + (yield* this.pushIndicators())
      case '&':
        return (yield* this.pushUntil(Rf)) + (yield* this.pushSpaces(!0)) + (yield* this.pushIndicators())
      case '-':
      case '?':
      case ':': {
        const l = this.flowLevel > 0,
          a = this.charAt(1)
        if (tn(a) || (l && xu.has(a)))
          return (
            l ? this.flowKey && (this.flowKey = !1) : (this.indentNext = this.indentValue + 1),
            (yield* this.pushCount(1)) + (yield* this.pushSpaces(!0)) + (yield* this.pushIndicators())
          )
      }
    }
    return 0
  }
  *pushTag() {
    if (this.charAt(1) === '<') {
      let l = this.pos + 2,
        a = this.buffer[l]
      for (; !tn(a) && a !== '>'; ) a = this.buffer[++l]
      return yield* this.pushToIndex(a === '>' ? l + 1 : l, !1)
    } else {
      let l = this.pos + 1,
        a = this.buffer[l]
      for (; a; )
        if (gS.has(a)) a = this.buffer[++l]
        else if (a === '%' && ip.has(this.buffer[l + 1]) && ip.has(this.buffer[l + 2])) a = this.buffer[(l += 3)]
        else break
      return yield* this.pushToIndex(l, !1)
    }
  }
  *pushNewline() {
    const l = this.buffer[this.pos]
    return l ===
      `
`
      ? yield* this.pushCount(1)
      : l === '\r' &&
          this.charAt(1) ===
            `
`
        ? yield* this.pushCount(2)
        : 0
  }
  *pushSpaces(l) {
    let a = this.pos - 1,
      u
    do u = this.buffer[++a]
    while (u === ' ' || (l && u === '	'))
    const c = a - this.pos
    return (c > 0 && (yield this.buffer.substr(this.pos, c), (this.pos = a)), c)
  }
  *pushUntil(l) {
    let a = this.pos,
      u = this.buffer[a]
    for (; !l(u); ) u = this.buffer[++a]
    return yield* this.pushToIndex(a, !1)
  }
}
class cg {
  constructor() {
    ;((this.lineStarts = []),
      (this.addNewLine = (l) => this.lineStarts.push(l)),
      (this.linePos = (l) => {
        let a = 0,
          u = this.lineStarts.length
        for (; a < u; ) {
          const f = (a + u) >> 1
          this.lineStarts[f] < l ? (a = f + 1) : (u = f)
        }
        if (this.lineStarts[a] === l) return { line: a + 1, col: 1 }
        if (a === 0) return { line: 0, col: l }
        const c = this.lineStarts[a - 1]
        return { line: a, col: l - c + 1 }
      }))
  }
}
function sl(s, l) {
  for (let a = 0; a < s.length; ++a) if (s[a].type === l) return !0
  return !1
}
function sp(s) {
  for (let l = 0; l < s.length; ++l)
    switch (s[l].type) {
      case 'space':
      case 'comment':
      case 'newline':
        break
      default:
        return l
    }
  return -1
}
function rg(s) {
  switch (s == null ? void 0 : s.type) {
    case 'alias':
    case 'scalar':
    case 'single-quoted-scalar':
    case 'double-quoted-scalar':
    case 'flow-collection':
      return !0
    default:
      return !1
  }
}
function Eu(s) {
  switch (s.type) {
    case 'document':
      return s.start
    case 'block-map': {
      const l = s.items[s.items.length - 1]
      return l.sep ?? l.start
    }
    case 'block-seq':
      return s.items[s.items.length - 1].start
    default:
      return []
  }
}
function Aa(s) {
  var a
  if (s.length === 0) return []
  let l = s.length
  e: for (; --l >= 0; )
    switch (s[l].type) {
      case 'doc-start':
      case 'explicit-key-ind':
      case 'map-value-ind':
      case 'seq-item-ind':
      case 'newline':
        break e
    }
  for (; ((a = s[++l]) == null ? void 0 : a.type) === 'space'; );
  return s.splice(l, s.length)
}
function up(s) {
  if (s.start.type === 'flow-seq-start')
    for (const l of s.items)
      l.sep &&
        !l.value &&
        !sl(l.start, 'explicit-key-ind') &&
        !sl(l.sep, 'map-value-ind') &&
        (l.key && (l.value = l.key),
        delete l.key,
        rg(l.value)
          ? l.value.end
            ? Array.prototype.push.apply(l.value.end, l.sep)
            : (l.value.end = l.sep)
          : Array.prototype.push.apply(l.start, l.sep),
        delete l.sep)
}
class To {
  constructor(l) {
    ;((this.atNewLine = !0),
      (this.atScalar = !1),
      (this.indent = 0),
      (this.offset = 0),
      (this.onKeyLine = !1),
      (this.stack = []),
      (this.source = ''),
      (this.type = ''),
      (this.lexer = new ug()),
      (this.onNewLine = l))
  }
  *parse(l, a = !1) {
    this.onNewLine && this.offset === 0 && this.onNewLine(0)
    for (const u of this.lexer.lex(l, a)) yield* this.next(u)
    a || (yield* this.end())
  }
  *next(l) {
    if (((this.source = l), this.atScalar)) {
      ;((this.atScalar = !1), yield* this.step(), (this.offset += l.length))
      return
    }
    const a = sg(l)
    if (a)
      if (a === 'scalar') ((this.atNewLine = !1), (this.atScalar = !0), (this.type = 'scalar'))
      else {
        switch (((this.type = a), yield* this.step(), a)) {
          case 'newline':
            ;((this.atNewLine = !0), (this.indent = 0), this.onNewLine && this.onNewLine(this.offset + l.length))
            break
          case 'space':
            this.atNewLine && l[0] === ' ' && (this.indent += l.length)
            break
          case 'explicit-key-ind':
          case 'map-value-ind':
          case 'seq-item-ind':
            this.atNewLine && (this.indent += l.length)
            break
          case 'doc-mode':
          case 'flow-error-end':
            return
          default:
            this.atNewLine = !1
        }
        this.offset += l.length
      }
    else {
      const u = `Not a YAML token: ${l}`
      ;(yield* this.pop({ type: 'error', offset: this.offset, message: u, source: l }), (this.offset += l.length))
    }
  }
  *end() {
    for (; this.stack.length > 0; ) yield* this.pop()
  }
  get sourceToken() {
    return { type: this.type, offset: this.offset, indent: this.indent, source: this.source }
  }
  *step() {
    const l = this.peek(1)
    if (this.type === 'doc-end' && (!l || l.type !== 'doc-end')) {
      for (; this.stack.length > 0; ) yield* this.pop()
      this.stack.push({ type: 'doc-end', offset: this.offset, source: this.source })
      return
    }
    if (!l) return yield* this.stream()
    switch (l.type) {
      case 'document':
        return yield* this.document(l)
      case 'alias':
      case 'scalar':
      case 'single-quoted-scalar':
      case 'double-quoted-scalar':
        return yield* this.scalar(l)
      case 'block-scalar':
        return yield* this.blockScalar(l)
      case 'block-map':
        return yield* this.blockMap(l)
      case 'block-seq':
        return yield* this.blockSequence(l)
      case 'flow-collection':
        return yield* this.flowCollection(l)
      case 'doc-end':
        return yield* this.documentEnd(l)
    }
    yield* this.pop()
  }
  peek(l) {
    return this.stack[this.stack.length - l]
  }
  *pop(l) {
    const a = l ?? this.stack.pop()
    if (!a) yield { type: 'error', offset: this.offset, source: '', message: 'Tried to pop an empty stack' }
    else if (this.stack.length === 0) yield a
    else {
      const u = this.peek(1)
      switch (
        (a.type === 'block-scalar'
          ? (a.indent = 'indent' in u ? u.indent : 0)
          : a.type === 'flow-collection' && u.type === 'document' && (a.indent = 0),
        a.type === 'flow-collection' && up(a),
        u.type)
      ) {
        case 'document':
          u.value = a
          break
        case 'block-scalar':
          u.props.push(a)
          break
        case 'block-map': {
          const c = u.items[u.items.length - 1]
          if (c.value) {
            ;(u.items.push({ start: [], key: a, sep: [] }), (this.onKeyLine = !0))
            return
          } else if (c.sep) c.value = a
          else {
            ;(Object.assign(c, { key: a, sep: [] }), (this.onKeyLine = !c.explicitKey))
            return
          }
          break
        }
        case 'block-seq': {
          const c = u.items[u.items.length - 1]
          c.value ? u.items.push({ start: [], value: a }) : (c.value = a)
          break
        }
        case 'flow-collection': {
          const c = u.items[u.items.length - 1]
          !c || c.value
            ? u.items.push({ start: [], key: a, sep: [] })
            : c.sep
              ? (c.value = a)
              : Object.assign(c, { key: a, sep: [] })
          return
        }
        default:
          ;(yield* this.pop(), yield* this.pop(a))
      }
      if (
        (u.type === 'document' || u.type === 'block-map' || u.type === 'block-seq') &&
        (a.type === 'block-map' || a.type === 'block-seq')
      ) {
        const c = a.items[a.items.length - 1]
        c &&
          !c.sep &&
          !c.value &&
          c.start.length > 0 &&
          sp(c.start) === -1 &&
          (a.indent === 0 || c.start.every((f) => f.type !== 'comment' || f.indent < a.indent)) &&
          (u.type === 'document' ? (u.end = c.start) : u.items.push({ start: c.start }), a.items.splice(-1, 1))
      }
    }
  }
  *stream() {
    switch (this.type) {
      case 'directive-line':
        yield { type: 'directive', offset: this.offset, source: this.source }
        return
      case 'byte-order-mark':
      case 'space':
      case 'comment':
      case 'newline':
        yield this.sourceToken
        return
      case 'doc-mode':
      case 'doc-start': {
        const l = { type: 'document', offset: this.offset, start: [] }
        ;(this.type === 'doc-start' && l.start.push(this.sourceToken), this.stack.push(l))
        return
      }
    }
    yield {
      type: 'error',
      offset: this.offset,
      message: `Unexpected ${this.type} token in YAML stream`,
      source: this.source,
    }
  }
  *document(l) {
    if (l.value) return yield* this.lineEnd(l)
    switch (this.type) {
      case 'doc-start': {
        sp(l.start) !== -1 ? (yield* this.pop(), yield* this.step()) : l.start.push(this.sourceToken)
        return
      }
      case 'anchor':
      case 'tag':
      case 'space':
      case 'comment':
      case 'newline':
        l.start.push(this.sourceToken)
        return
    }
    const a = this.startBlockValue(l)
    a
      ? this.stack.push(a)
      : yield {
          type: 'error',
          offset: this.offset,
          message: `Unexpected ${this.type} token in YAML document`,
          source: this.source,
        }
  }
  *scalar(l) {
    if (this.type === 'map-value-ind') {
      const a = Eu(this.peek(2)),
        u = Aa(a)
      let c
      l.end ? ((c = l.end), c.push(this.sourceToken), delete l.end) : (c = [this.sourceToken])
      const f = { type: 'block-map', offset: l.offset, indent: l.indent, items: [{ start: u, key: l, sep: c }] }
      ;((this.onKeyLine = !0), (this.stack[this.stack.length - 1] = f))
    } else yield* this.lineEnd(l)
  }
  *blockScalar(l) {
    switch (this.type) {
      case 'space':
      case 'comment':
      case 'newline':
        l.props.push(this.sourceToken)
        return
      case 'scalar':
        if (((l.source = this.source), (this.atNewLine = !0), (this.indent = 0), this.onNewLine)) {
          let a =
            this.source.indexOf(`
`) + 1
          for (; a !== 0; )
            (this.onNewLine(this.offset + a),
              (a =
                this.source.indexOf(
                  `
`,
                  a
                ) + 1))
        }
        yield* this.pop()
        break
      default:
        ;(yield* this.pop(), yield* this.step())
    }
  }
  *blockMap(l) {
    var u
    const a = l.items[l.items.length - 1]
    switch (this.type) {
      case 'newline':
        if (((this.onKeyLine = !1), a.value)) {
          const c = 'end' in a.value ? a.value.end : void 0,
            f = Array.isArray(c) ? c[c.length - 1] : void 0
          ;(f == null ? void 0 : f.type) === 'comment'
            ? c == null || c.push(this.sourceToken)
            : l.items.push({ start: [this.sourceToken] })
        } else a.sep ? a.sep.push(this.sourceToken) : a.start.push(this.sourceToken)
        return
      case 'space':
      case 'comment':
        if (a.value) l.items.push({ start: [this.sourceToken] })
        else if (a.sep) a.sep.push(this.sourceToken)
        else {
          if (this.atIndentedComment(a.start, l.indent)) {
            const c = l.items[l.items.length - 2],
              f = (u = c == null ? void 0 : c.value) == null ? void 0 : u.end
            if (Array.isArray(f)) {
              ;(Array.prototype.push.apply(f, a.start), f.push(this.sourceToken), l.items.pop())
              return
            }
          }
          a.start.push(this.sourceToken)
        }
        return
    }
    if (this.indent >= l.indent) {
      const c = !this.onKeyLine && this.indent === l.indent,
        f = c && (a.sep || a.explicitKey) && this.type !== 'seq-item-ind'
      let d = []
      if (f && a.sep && !a.value) {
        const m = []
        for (let g = 0; g < a.sep.length; ++g) {
          const p = a.sep[g]
          switch (p.type) {
            case 'newline':
              m.push(g)
              break
            case 'space':
              break
            case 'comment':
              p.indent > l.indent && (m.length = 0)
              break
            default:
              m.length = 0
          }
        }
        m.length >= 2 && (d = a.sep.splice(m[1]))
      }
      switch (this.type) {
        case 'anchor':
        case 'tag':
          f || a.value
            ? (d.push(this.sourceToken), l.items.push({ start: d }), (this.onKeyLine = !0))
            : a.sep
              ? a.sep.push(this.sourceToken)
              : a.start.push(this.sourceToken)
          return
        case 'explicit-key-ind':
          ;(!a.sep && !a.explicitKey
            ? (a.start.push(this.sourceToken), (a.explicitKey = !0))
            : f || a.value
              ? (d.push(this.sourceToken), l.items.push({ start: d, explicitKey: !0 }))
              : this.stack.push({
                  type: 'block-map',
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: [this.sourceToken], explicitKey: !0 }],
                }),
            (this.onKeyLine = !0))
          return
        case 'map-value-ind':
          if (a.explicitKey)
            if (a.sep)
              if (a.value) l.items.push({ start: [], key: null, sep: [this.sourceToken] })
              else if (sl(a.sep, 'map-value-ind'))
                this.stack.push({
                  type: 'block-map',
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: d, key: null, sep: [this.sourceToken] }],
                })
              else if (rg(a.key) && !sl(a.sep, 'newline')) {
                const m = Aa(a.start),
                  g = a.key,
                  p = a.sep
                ;(p.push(this.sourceToken),
                  delete a.key,
                  delete a.sep,
                  this.stack.push({
                    type: 'block-map',
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: m, key: g, sep: p }],
                  }))
              } else d.length > 0 ? (a.sep = a.sep.concat(d, this.sourceToken)) : a.sep.push(this.sourceToken)
            else if (sl(a.start, 'newline')) Object.assign(a, { key: null, sep: [this.sourceToken] })
            else {
              const m = Aa(a.start)
              this.stack.push({
                type: 'block-map',
                offset: this.offset,
                indent: this.indent,
                items: [{ start: m, key: null, sep: [this.sourceToken] }],
              })
            }
          else
            a.sep
              ? a.value || f
                ? l.items.push({ start: d, key: null, sep: [this.sourceToken] })
                : sl(a.sep, 'map-value-ind')
                  ? this.stack.push({
                      type: 'block-map',
                      offset: this.offset,
                      indent: this.indent,
                      items: [{ start: [], key: null, sep: [this.sourceToken] }],
                    })
                  : a.sep.push(this.sourceToken)
              : Object.assign(a, { key: null, sep: [this.sourceToken] })
          this.onKeyLine = !0
          return
        case 'alias':
        case 'scalar':
        case 'single-quoted-scalar':
        case 'double-quoted-scalar': {
          const m = this.flowScalar(this.type)
          f || a.value
            ? (l.items.push({ start: d, key: m, sep: [] }), (this.onKeyLine = !0))
            : a.sep
              ? this.stack.push(m)
              : (Object.assign(a, { key: m, sep: [] }), (this.onKeyLine = !0))
          return
        }
        default: {
          const m = this.startBlockValue(l)
          if (m) {
            if (m.type === 'block-seq') {
              if (!a.explicitKey && a.sep && !sl(a.sep, 'newline')) {
                yield* this.pop({
                  type: 'error',
                  offset: this.offset,
                  message: 'Unexpected block-seq-ind on same line with key',
                  source: this.source,
                })
                return
              }
            } else c && l.items.push({ start: d })
            this.stack.push(m)
            return
          }
        }
      }
    }
    ;(yield* this.pop(), yield* this.step())
  }
  *blockSequence(l) {
    var u
    const a = l.items[l.items.length - 1]
    switch (this.type) {
      case 'newline':
        if (a.value) {
          const c = 'end' in a.value ? a.value.end : void 0,
            f = Array.isArray(c) ? c[c.length - 1] : void 0
          ;(f == null ? void 0 : f.type) === 'comment'
            ? c == null || c.push(this.sourceToken)
            : l.items.push({ start: [this.sourceToken] })
        } else a.start.push(this.sourceToken)
        return
      case 'space':
      case 'comment':
        if (a.value) l.items.push({ start: [this.sourceToken] })
        else {
          if (this.atIndentedComment(a.start, l.indent)) {
            const c = l.items[l.items.length - 2],
              f = (u = c == null ? void 0 : c.value) == null ? void 0 : u.end
            if (Array.isArray(f)) {
              ;(Array.prototype.push.apply(f, a.start), f.push(this.sourceToken), l.items.pop())
              return
            }
          }
          a.start.push(this.sourceToken)
        }
        return
      case 'anchor':
      case 'tag':
        if (a.value || this.indent <= l.indent) break
        a.start.push(this.sourceToken)
        return
      case 'seq-item-ind':
        if (this.indent !== l.indent) break
        a.value || sl(a.start, 'seq-item-ind')
          ? l.items.push({ start: [this.sourceToken] })
          : a.start.push(this.sourceToken)
        return
    }
    if (this.indent > l.indent) {
      const c = this.startBlockValue(l)
      if (c) {
        this.stack.push(c)
        return
      }
    }
    ;(yield* this.pop(), yield* this.step())
  }
  *flowCollection(l) {
    const a = l.items[l.items.length - 1]
    if (this.type === 'flow-error-end') {
      let u
      do (yield* this.pop(), (u = this.peek(1)))
      while (u && u.type === 'flow-collection')
    } else if (l.end.length === 0) {
      switch (this.type) {
        case 'comma':
        case 'explicit-key-ind':
          !a || a.sep ? l.items.push({ start: [this.sourceToken] }) : a.start.push(this.sourceToken)
          return
        case 'map-value-ind':
          !a || a.value
            ? l.items.push({ start: [], key: null, sep: [this.sourceToken] })
            : a.sep
              ? a.sep.push(this.sourceToken)
              : Object.assign(a, { key: null, sep: [this.sourceToken] })
          return
        case 'space':
        case 'comment':
        case 'newline':
        case 'anchor':
        case 'tag':
          !a || a.value
            ? l.items.push({ start: [this.sourceToken] })
            : a.sep
              ? a.sep.push(this.sourceToken)
              : a.start.push(this.sourceToken)
          return
        case 'alias':
        case 'scalar':
        case 'single-quoted-scalar':
        case 'double-quoted-scalar': {
          const c = this.flowScalar(this.type)
          !a || a.value
            ? l.items.push({ start: [], key: c, sep: [] })
            : a.sep
              ? this.stack.push(c)
              : Object.assign(a, { key: c, sep: [] })
          return
        }
        case 'flow-map-end':
        case 'flow-seq-end':
          l.end.push(this.sourceToken)
          return
      }
      const u = this.startBlockValue(l)
      u ? this.stack.push(u) : (yield* this.pop(), yield* this.step())
    } else {
      const u = this.peek(2)
      if (
        u.type === 'block-map' &&
        ((this.type === 'map-value-ind' && u.indent === l.indent) ||
          (this.type === 'newline' && !u.items[u.items.length - 1].sep))
      )
        (yield* this.pop(), yield* this.step())
      else if (this.type === 'map-value-ind' && u.type !== 'flow-collection') {
        const c = Eu(u),
          f = Aa(c)
        up(l)
        const d = l.end.splice(1, l.end.length)
        d.push(this.sourceToken)
        const m = { type: 'block-map', offset: l.offset, indent: l.indent, items: [{ start: f, key: l, sep: d }] }
        ;((this.onKeyLine = !0), (this.stack[this.stack.length - 1] = m))
      } else yield* this.lineEnd(l)
    }
  }
  flowScalar(l) {
    if (this.onNewLine) {
      let a =
        this.source.indexOf(`
`) + 1
      for (; a !== 0; )
        (this.onNewLine(this.offset + a),
          (a =
            this.source.indexOf(
              `
`,
              a
            ) + 1))
    }
    return { type: l, offset: this.offset, indent: this.indent, source: this.source }
  }
  startBlockValue(l) {
    switch (this.type) {
      case 'alias':
      case 'scalar':
      case 'single-quoted-scalar':
      case 'double-quoted-scalar':
        return this.flowScalar(this.type)
      case 'block-scalar-header':
        return { type: 'block-scalar', offset: this.offset, indent: this.indent, props: [this.sourceToken], source: '' }
      case 'flow-map-start':
      case 'flow-seq-start':
        return {
          type: 'flow-collection',
          offset: this.offset,
          indent: this.indent,
          start: this.sourceToken,
          items: [],
          end: [],
        }
      case 'seq-item-ind':
        return { type: 'block-seq', offset: this.offset, indent: this.indent, items: [{ start: [this.sourceToken] }] }
      case 'explicit-key-ind': {
        this.onKeyLine = !0
        const a = Eu(l),
          u = Aa(a)
        return (
          u.push(this.sourceToken),
          { type: 'block-map', offset: this.offset, indent: this.indent, items: [{ start: u, explicitKey: !0 }] }
        )
      }
      case 'map-value-ind': {
        this.onKeyLine = !0
        const a = Eu(l),
          u = Aa(a)
        return {
          type: 'block-map',
          offset: this.offset,
          indent: this.indent,
          items: [{ start: u, key: null, sep: [this.sourceToken] }],
        }
      }
    }
    return null
  }
  atIndentedComment(l, a) {
    return this.type !== 'comment' || this.indent <= a ? !1 : l.every((u) => u.type === 'newline' || u.type === 'space')
  }
  *documentEnd(l) {
    this.type !== 'doc-mode' &&
      (l.end ? l.end.push(this.sourceToken) : (l.end = [this.sourceToken]),
      this.type === 'newline' && (yield* this.pop()))
  }
  *lineEnd(l) {
    switch (this.type) {
      case 'comma':
      case 'doc-start':
      case 'doc-end':
      case 'flow-seq-end':
      case 'flow-map-end':
      case 'map-value-ind':
        ;(yield* this.pop(), yield* this.step())
        break
      case 'newline':
        this.onKeyLine = !1
      case 'space':
      case 'comment':
      default:
        ;(l.end ? l.end.push(this.sourceToken) : (l.end = [this.sourceToken]),
          this.type === 'newline' && (yield* this.pop()))
    }
  }
}
function fg(s) {
  const l = s.prettyErrors !== !1
  return { lineCounter: s.lineCounter || (l && new cg()) || null, prettyErrors: l }
}
function bS(s, l = {}) {
  const { lineCounter: a, prettyErrors: u } = fg(l),
    c = new To(a == null ? void 0 : a.addNewLine),
    f = new _o(l),
    d = Array.from(f.compose(c.parse(s)))
  if (u && a) for (const m of d) (m.errors.forEach(Bu(s, a)), m.warnings.forEach(Bu(s, a)))
  return d.length > 0 ? d : Object.assign([], { empty: !0 }, f.streamInfo())
}
function og(s, l = {}) {
  const { lineCounter: a, prettyErrors: u } = fg(l),
    c = new To(a == null ? void 0 : a.addNewLine),
    f = new _o(l)
  let d = null
  for (const m of f.compose(c.parse(s), !0, s.length))
    if (!d) d = m
    else if (d.options.logLevel !== 'silent') {
      d.errors.push(
        new Ll(
          m.range.slice(0, 2),
          'MULTIPLE_DOCS',
          'Source contains multiple documents; please use YAML.parseAllDocuments()'
        )
      )
      break
    }
  return (u && a && (d.errors.forEach(Bu(s, a)), d.warnings.forEach(Bu(s, a))), d)
}
function SS(s, l, a) {
  let u
  typeof l == 'function' ? (u = l) : a === void 0 && l && typeof l == 'object' && (a = l)
  const c = og(s, a)
  if (!c) return null
  if ((c.warnings.forEach((f) => Cp(c.options.logLevel, f)), c.errors.length > 0)) {
    if (c.options.logLevel !== 'silent') throw c.errors[0]
    c.errors = []
  }
  return c.toJS(Object.assign({ reviver: u }, a))
}
function _S(s, l, a) {
  let u = null
  if (
    (typeof l == 'function' || Array.isArray(l) ? (u = l) : a === void 0 && l && (a = l),
    typeof a == 'string' && (a = a.length),
    typeof a == 'number')
  ) {
    const c = Math.round(a)
    a = c < 1 ? void 0 : c > 8 ? { indent: 8 } : { indent: c }
  }
  if (s === void 0) {
    const { keepUndefined: c } = a ?? l ?? {}
    if (!c) return
  }
  return ql(s) && !u ? s.toString(a) : new Qa(s, u, a).toString(a)
}
const TS = Object.freeze(
  Object.defineProperty(
    {
      __proto__: null,
      Alias: Zu,
      CST: pS,
      Composer: _o,
      Document: Qa,
      Lexer: ug,
      LineCounter: cg,
      Pair: dt,
      Parser: To,
      Scalar: de,
      Schema: Wu,
      YAMLError: bo,
      YAMLMap: Bt,
      YAMLParseError: Ll,
      YAMLSeq: ol,
      YAMLWarning: Ip,
      isAlias: dl,
      isCollection: Ze,
      isDocument: ql,
      isMap: Va,
      isNode: Ve,
      isPair: Ye,
      isScalar: Ue,
      isSeq: Ka,
      parse: SS,
      parseAllDocuments: bS,
      parseDocument: og,
      stringify: _S,
      visit: Hl,
      visitAsync: Yu,
    },
    Symbol.toStringTag,
    { value: 'Module' }
  )
)
function NS(s) {
  const l = s.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!l) return { success: !1, error: 'Invalid SKILL.md format. Must start with YAML frontmatter (---)' }
  const [, a, u] = l
  let c
  try {
    c = TS.parse(a)
  } catch (d) {
    return { success: !1, error: `Invalid YAML frontmatter: ${d instanceof Error ? d.message : String(d)}` }
  }
  const f = h1.safeParse({ metadata: c, body: u.trim() })
  return f.success ? { success: !0, skill: f.data } : { success: !1, error: 'Validation failed', details: f.error }
}
const xS = ['craft', 'framework', 'workflow', 'custom'],
  ES = new Set(['name', 'description', 'category', 'featured'])
function cp() {
  return { name: '', description: '', body: '', category: 'custom', featured: !1 }
}
function Uf(s) {
  return s ? new Date(s).toLocaleString() : 'Never'
}
function AS(s) {
  return typeof s == 'object' && s !== null && !Array.isArray(s)
}
function rp(s) {
  const l = {}
  for (const [a, u] of Object.entries(s.metadata ?? {})) ES.has(a) || (l[a] = u)
  return l
}
function Bf(s) {
  return Object.keys(s).length > 0 ? JSON.stringify(s, null, 2) : ''
}
function OS(s) {
  return { name: s.name, description: s.description, body: s.body, category: s.category, featured: s.featured }
}
function jS(s) {
  const l = s.trim()
  if (!l) return {}
  const a = JSON.parse(l)
  if (!AS(a)) throw new Error('Extra metadata must be a JSON object')
  return a
}
function wS(s, l) {
  return { ...s, metadata: jS(l) }
}
function kS() {
  const [s, l] = W.useState([]),
    [a, u] = W.useState(null),
    [c, f] = W.useState('view'),
    [d, m] = W.useState(() => cp()),
    [g, p] = W.useState(''),
    [_, S] = W.useState(''),
    [O, E] = W.useState(!0),
    [U, A] = W.useState(!1),
    [M, K] = W.useState(!1),
    [Z, I] = W.useState(''),
    [Y, L] = W.useState(null),
    [$, X] = W.useState(null)
  async function G(H) {
    var ie
    L(null)
    try {
      const ge = await eb()
      l(ge)
      const N = H && ge.some((B) => B.id === H) ? H : (((ie = ge[0]) == null ? void 0 : ie.id) ?? null)
      u(N)
    } catch (ge) {
      L(ge instanceof Error ? ge.message : 'Failed to load skills')
    } finally {
      E(!1)
    }
  }
  W.useEffect(() => {
    G()
  }, [])
  const ce = W.useMemo(() => s.find((H) => H.id === a) ?? null, [a, s]),
    We = W.useMemo(() => {
      const H = Z.trim().toLowerCase()
      return H
        ? s.filter(
            (ie) =>
              ie.name.toLowerCase().includes(H) ||
              ie.description.toLowerCase().includes(H) ||
              ie.category.toLowerCase().includes(H)
          )
        : s
    }, [s, Z])
  function Ke() {
    ;(u(null), m(cp()), p(''), S(''), X(null), L(null), f('create'))
  }
  function F(H) {
    ;(u(H.id), m(OS(H)), p(Bf(rp(H))), S(''), X(null), L(null), f('edit'))
  }
  function Me() {
    ;(f('view'), S(''), L(null), !a && s[0] && u(s[0].id))
  }
  function At() {
    L(null)
    const H = NS(_)
    if (!H.success) {
      L(H.error)
      return
    }
    const { name: ie, description: ge, featured: N, ...B } = H.skill.metadata
    ;(m((J) => ({
      ...J,
      name: ie,
      description: ge,
      body: H.skill.body,
      featured: typeof N == 'boolean' ? N : J.featured,
    })),
      p(Bf(B)),
      S(''))
  }
  async function Ot(H) {
    ;(H.preventDefault(), A(!0), L(null), X(null))
    try {
      const ie = wS(d, g),
        ge = c === 'edit' && ce ? await nb(ce.id, ie) : await tb(ie)
      ;(f('view'), X(`Saved ${ge.name}`), await G(ge.id))
    } catch (ie) {
      ie instanceof SyntaxError
        ? L('Extra metadata is not valid JSON')
        : L(ie instanceof Error ? ie.message : 'Failed to save skill')
    } finally {
      A(!1)
    }
  }
  async function z(H) {
    if (confirm(`Delete ${H.name}?`)) {
      ;(K(!0), L(null), X(null))
      try {
        ;(await lb(H.id), X(`Deleted ${H.name}`), await G(null))
      } catch (ie) {
        L(ie instanceof Error ? ie.message : 'Failed to delete skill')
      } finally {
        K(!1)
      }
    }
  }
  if (O) return y.jsx('div', { className: 'loading', children: 'Loading...' })
  const Q = ce ? rp(ce) : {}
  return y.jsxs('div', {
    className: 'skills-page',
    children: [
      y.jsxs('div', {
        className: 'skills-toolbar',
        children: [
          y.jsxs('div', {
            children: [
              y.jsx('h2', { children: 'Skills' }),
              y.jsxs('div', { className: 'text-muted', children: [s.length, ' global system skills'] }),
            ],
          }),
          y.jsx('button', { className: 'btn btn-primary', type: 'button', onClick: Ke, children: 'Add skill' }),
        ],
      }),
      Y && y.jsx('div', { className: 'template-error', children: Y }),
      $ && y.jsx('div', { className: 'template-success', children: $ }),
      y.jsxs('div', {
        className: 'skills-layout',
        children: [
          y.jsxs('div', {
            className: 'skills-list-panel',
            children: [
              y.jsx('div', {
                className: 'search-bar skills-search',
                children: y.jsx('input', {
                  type: 'text',
                  placeholder: 'Search skills',
                  value: Z,
                  onChange: (H) => I(H.target.value),
                }),
              }),
              y.jsxs('table', {
                className: 'skills-table',
                children: [
                  y.jsx('thead', {
                    children: y.jsxs('tr', {
                      children: [
                        y.jsx('th', { children: 'Name' }),
                        y.jsx('th', { children: 'Category' }),
                        y.jsx('th', { children: 'Updated' }),
                      ],
                    }),
                  }),
                  y.jsxs('tbody', {
                    children: [
                      We.map((H) =>
                        y.jsxs(
                          'tr',
                          {
                            className: H.id === a ? 'selected-row' : void 0,
                            onClick: () => {
                              ;(u(H.id), f('view'), L(null), X(null))
                            },
                            children: [
                              y.jsxs('td', {
                                children: [
                                  y.jsxs('div', {
                                    className: 'skill-name-cell',
                                    children: [
                                      y.jsx('code', { children: H.name }),
                                      H.featured &&
                                        y.jsx('span', { className: 'badge badge-yellow', children: 'Featured' }),
                                    ],
                                  }),
                                  y.jsx('div', {
                                    className: 'text-muted skill-description-cell',
                                    children: H.description,
                                  }),
                                ],
                              }),
                              y.jsx('td', {
                                children: y.jsx('span', { className: 'badge badge-gray', children: H.category }),
                              }),
                              y.jsx('td', { className: 'text-muted', children: Uf(H.updatedAt) }),
                            ],
                          },
                          H.id
                        )
                      ),
                      We.length === 0 &&
                        y.jsx('tr', {
                          children: y.jsx('td', {
                            colSpan: 3,
                            className: 'text-muted',
                            style: { textAlign: 'center', padding: 32 },
                            children: 'No skills found',
                          }),
                        }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          y.jsx('div', {
            className: 'skills-detail-panel',
            children:
              c === 'create' || c === 'edit'
                ? y.jsxs('form', {
                    onSubmit: Ot,
                    className: 'skill-form',
                    children: [
                      y.jsxs('div', {
                        className: 'skill-panel-header',
                        children: [
                          y.jsx('h3', { children: c === 'create' ? 'Add Skill' : 'Edit Skill' }),
                          y.jsxs('div', {
                            className: 'skill-panel-actions',
                            children: [
                              y.jsx('button', {
                                className: 'btn btn-secondary',
                                type: 'button',
                                onClick: Me,
                                disabled: U,
                                children: 'Cancel',
                              }),
                              y.jsx('button', {
                                className: 'btn btn-primary',
                                type: 'submit',
                                disabled: U,
                                children: U ? 'Saving...' : 'Save',
                              }),
                            ],
                          }),
                        ],
                      }),
                      y.jsxs('div', {
                        className: 'skill-form-grid',
                        children: [
                          y.jsx('label', { children: 'Name' }),
                          y.jsx('input', {
                            type: 'text',
                            value: d.name,
                            onChange: (H) =>
                              m((ie) => ({ ...ie, name: H.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })),
                            placeholder: 'my-skill',
                            required: !0,
                          }),
                          y.jsx('label', { children: 'Category' }),
                          y.jsx('select', {
                            value: d.category,
                            onChange: (H) => m((ie) => ({ ...ie, category: H.target.value })),
                            children: xS.map((H) => y.jsx('option', { value: H, children: H }, H)),
                          }),
                          y.jsx('label', { children: 'Featured' }),
                          y.jsxs('label', {
                            className: 'skill-checkbox',
                            children: [
                              y.jsx('input', {
                                type: 'checkbox',
                                checked: d.featured,
                                onChange: (H) => m((ie) => ({ ...ie, featured: H.target.checked })),
                              }),
                              'Show as featured',
                            ],
                          }),
                        ],
                      }),
                      y.jsx('label', { className: 'skill-field-label', children: 'Description' }),
                      y.jsx('textarea', {
                        className: 'skill-description-input',
                        value: d.description,
                        onChange: (H) => m((ie) => ({ ...ie, description: H.target.value })),
                        rows: 3,
                        required: !0,
                      }),
                      y.jsx('label', { className: 'skill-field-label', children: 'Instructions' }),
                      y.jsx('textarea', {
                        className: 'skill-body-input',
                        value: d.body,
                        onChange: (H) => m((ie) => ({ ...ie, body: H.target.value })),
                        required: !0,
                      }),
                      y.jsx('label', { className: 'skill-field-label', children: 'Extra Metadata JSON' }),
                      y.jsx('textarea', {
                        className: 'skill-metadata-input',
                        value: g,
                        onChange: (H) => p(H.target.value),
                        placeholder: '{"license":"MIT"}',
                      }),
                      y.jsxs('div', {
                        className: 'skill-import-panel',
                        children: [
                          y.jsx('label', { className: 'skill-field-label', children: 'Import SKILL.md' }),
                          y.jsx('textarea', {
                            className: 'skill-import-input',
                            value: _,
                            onChange: (H) => S(H.target.value),
                            placeholder: `---
name: my-skill
description: What this skill does
---

# My Skill`,
                          }),
                          y.jsxs('div', {
                            className: 'skill-panel-actions',
                            children: [
                              y.jsx('button', {
                                className: 'btn btn-secondary',
                                type: 'button',
                                onClick: () => S(''),
                                disabled: !_.trim(),
                                children: 'Clear import',
                              }),
                              y.jsx('button', {
                                className: 'btn btn-secondary',
                                type: 'button',
                                onClick: At,
                                disabled: !_.trim(),
                                children: 'Parse import',
                              }),
                            ],
                          }),
                        ],
                      }),
                    ],
                  })
                : ce
                  ? y.jsxs('div', {
                      className: 'skill-detail',
                      children: [
                        y.jsxs('div', {
                          className: 'skill-panel-header',
                          children: [
                            y.jsxs('div', {
                              children: [
                                y.jsx('h3', { children: ce.name }),
                                y.jsxs('div', {
                                  className: 'skill-detail-badges',
                                  children: [
                                    y.jsx('span', { className: 'badge badge-gray', children: ce.category }),
                                    ce.featured &&
                                      y.jsx('span', { className: 'badge badge-yellow', children: 'Featured' }),
                                  ],
                                }),
                              ],
                            }),
                            y.jsxs('div', {
                              className: 'skill-panel-actions',
                              children: [
                                y.jsx('button', {
                                  className: 'btn btn-secondary',
                                  type: 'button',
                                  onClick: () => F(ce),
                                  children: 'Edit',
                                }),
                                y.jsx('button', {
                                  className: 'btn btn-danger',
                                  type: 'button',
                                  onClick: () => void z(ce),
                                  disabled: M,
                                  children: M ? 'Deleting...' : 'Delete',
                                }),
                              ],
                            }),
                          ],
                        }),
                        y.jsxs('div', {
                          className: 'skill-detail-meta',
                          children: [
                            y.jsxs('div', {
                              children: [
                                y.jsx('span', { className: 'text-muted', children: 'Created' }),
                                y.jsx('div', { children: Uf(ce.createdAt) }),
                              ],
                            }),
                            y.jsxs('div', {
                              children: [
                                y.jsx('span', { className: 'text-muted', children: 'Updated' }),
                                y.jsx('div', { children: Uf(ce.updatedAt) }),
                              ],
                            }),
                          ],
                        }),
                        y.jsxs('div', {
                          className: 'section',
                          children: [
                            y.jsx('h3', { children: 'Description' }),
                            y.jsx('p', { children: ce.description }),
                          ],
                        }),
                        y.jsxs('div', {
                          className: 'section',
                          children: [
                            y.jsx('h3', { children: 'Instructions' }),
                            y.jsx('pre', { className: 'skill-body-preview', children: ce.body }),
                          ],
                        }),
                        Object.keys(Q).length > 0 &&
                          y.jsxs('div', {
                            className: 'section',
                            children: [
                              y.jsx('h3', { children: 'Extra Metadata' }),
                              y.jsx('pre', { className: 'skill-body-preview', children: Bf(Q) }),
                            ],
                          }),
                      ],
                    })
                  : y.jsxs('div', {
                      className: 'skill-empty-state',
                      children: [
                        y.jsx('div', { children: 'No skill selected' }),
                        y.jsx('button', {
                          className: 'btn btn-primary',
                          type: 'button',
                          onClick: Ke,
                          children: 'Add skill',
                        }),
                      ],
                    }),
          }),
        ],
      }),
    ],
  })
}
function qf(s) {
  return s ? new Date(s).toLocaleString() : 'Never'
}
function CS(s, l) {
  const a = new Blob([JSON.stringify(l, null, 2)], { type: 'application/json' }),
    u = URL.createObjectURL(a),
    c = document.createElement('a')
  ;((c.href = u), (c.download = s), document.body.appendChild(c), c.click(), c.remove(), URL.revokeObjectURL(u))
}
function MS(s) {
  return `${
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'workspace'
  }-template.json`
}
function DS() {
  const s = W.useRef(null),
    [l, a] = W.useState(''),
    [u, c] = W.useState([]),
    [f, d] = W.useState(null),
    [m, g] = W.useState(null),
    [p, _] = W.useState(null),
    [S, O] = W.useState(null),
    [E, U] = W.useState(!0),
    [A, M] = W.useState(!0),
    [K, Z] = W.useState(!1),
    [I, Y] = W.useState(!1),
    [L, $] = W.useState(null)
  async function X(F) {
    U(!0)
    try {
      c(await fb(F))
    } catch (Me) {
      _(Me instanceof Error ? Me.message : 'Failed to load workspaces')
    } finally {
      U(!1)
    }
  }
  async function G() {
    M(!0)
    try {
      const F = await db()
      d(F.template)
    } catch (F) {
      _(F instanceof Error ? F.message : 'Failed to load default workspace template')
    } finally {
      M(!1)
    }
  }
  W.useEffect(() => {
    Promise.all([X(), G()])
  }, [])
  async function ce(F) {
    ;(_(null), O(null), $(F.id))
    try {
      const Me = await ob(F.id)
      ;(CS(MS(F.name), Me), O(`Downloaded template for ${F.name}`))
    } catch (Me) {
      _(Me instanceof Error ? Me.message : 'Failed to export workspace template')
    } finally {
      $(null)
    }
  }
  async function We() {
    if (!m) {
      _('Choose a template JSON file first')
      return
    }
    ;(Z(!0), _(null), O(null))
    try {
      const F = await m.text(),
        Me = JSON.parse(F),
        At = await hb(Me)
      ;(d(At.template),
        g(null),
        s.current && (s.current.value = ''),
        O(`Uploaded ${m.name} as the default workspace template`))
    } catch (F) {
      F instanceof SyntaxError
        ? _('Template file is not valid JSON')
        : _(F instanceof Error ? F.message : 'Failed to upload workspace template')
    } finally {
      Z(!1)
    }
  }
  async function Ke() {
    ;(Y(!0), _(null), O(null))
    try {
      ;(await mb(),
        d(null),
        O('Cleared uploaded default workspace template. New workspaces will use the minimal built-in workspace.'))
    } catch (F) {
      _(F instanceof Error ? F.message : 'Failed to clear default workspace template')
    } finally {
      Y(!1)
    }
  }
  return y.jsxs('div', {
    children: [
      y.jsxs('div', {
        className: 'section',
        children: [
          y.jsx('h3', { children: 'Default Workspace' }),
          A
            ? y.jsx('div', { className: 'loading', children: 'Loading...' })
            : f
              ? y.jsxs('div', {
                  className: 'template-card',
                  children: [
                    y.jsxs('div', {
                      className: 'template-card-row',
                      children: [
                        y.jsx('span', { className: 'template-label', children: 'Active template' }),
                        y.jsx('strong', { children: f.name }),
                      ],
                    }),
                    y.jsxs('div', {
                      className: 'template-meta-grid',
                      children: [
                        y.jsxs('div', {
                          children: [
                            y.jsx('span', { className: 'text-muted', children: 'Version' }),
                            y.jsx('div', { children: f.version }),
                          ],
                        }),
                        y.jsxs('div', {
                          children: [
                            y.jsx('span', { className: 'text-muted', children: 'Exported' }),
                            y.jsx('div', { children: qf(f.exportedAt) }),
                          ],
                        }),
                        y.jsxs('div', {
                          children: [
                            y.jsx('span', { className: 'text-muted', children: 'Updated' }),
                            y.jsx('div', { children: qf(f.updatedAt) }),
                          ],
                        }),
                      ],
                    }),
                    y.jsx('div', {
                      className: 'template-actions',
                      children: y.jsx('button', {
                        className: 'btn btn-danger',
                        onClick: Ke,
                        disabled: I,
                        children: I ? 'Clearing...' : 'Clear Uploaded Template',
                      }),
                    }),
                  ],
                })
              : y.jsxs('div', {
                  className: 'template-card',
                  children: [
                    y.jsx('div', { children: 'No uploaded template is active.' }),
                    y.jsx('div', {
                      className: 'text-muted',
                      style: { marginTop: 6 },
                      children:
                        'New workspaces currently fall back to the minimal built-in workspace with only `instructions`.',
                    }),
                  ],
                }),
        ],
      }),
      y.jsxs('div', {
        className: 'section',
        children: [
          y.jsx('h3', { children: 'Upload Template' }),
          y.jsxs('div', {
            className: 'template-upload-row',
            children: [
              y.jsx('input', {
                ref: s,
                type: 'file',
                accept: 'application/json,.json',
                onChange: (F) => {
                  var Me
                  return g(((Me = F.target.files) == null ? void 0 : Me[0]) ?? null)
                },
              }),
              y.jsx('button', {
                className: 'btn btn-primary',
                onClick: We,
                disabled: K,
                children: K ? 'Uploading...' : 'Upload as Default',
              }),
            ],
          }),
          y.jsx('div', {
            className: 'text-muted',
            style: { marginTop: 8, fontSize: 12 },
            children:
              'Hard errors are returned for non-portable templates. Image nodes are bundled in the JSON; file, audio, and link preview-image nodes are not allowed.',
          }),
        ],
      }),
      y.jsxs('div', {
        className: 'section',
        children: [
          y.jsx('h3', { children: 'Export Workspace Template' }),
          y.jsxs('form', {
            className: 'template-search',
            onSubmit: (F) => {
              ;(F.preventDefault(), _(null), O(null), X(l))
            },
            children: [
              y.jsx('input', {
                type: 'text',
                placeholder: 'Search by workspace, organization, or workspace ID',
                value: l,
                onChange: (F) => a(F.target.value),
              }),
              y.jsx('button', { className: 'btn btn-secondary', type: 'submit', disabled: E, children: 'Search' }),
            ],
          }),
          p && y.jsx('div', { className: 'template-error', children: p }),
          S && y.jsx('div', { className: 'template-success', children: S }),
          E
            ? y.jsx('div', { className: 'loading', children: 'Loading...' })
            : y.jsxs('table', {
                children: [
                  y.jsx('thead', {
                    children: y.jsxs('tr', {
                      children: [
                        y.jsx('th', { children: 'Workspace' }),
                        y.jsx('th', { children: 'Organization' }),
                        y.jsx('th', { children: 'Updated' }),
                        y.jsx('th', { style: { textAlign: 'right' }, children: 'Action' }),
                      ],
                    }),
                  }),
                  y.jsxs('tbody', {
                    children: [
                      u.map((F) => {
                        var Me
                        return y.jsxs(
                          'tr',
                          {
                            style: { cursor: 'default' },
                            children: [
                              y.jsx('td', { children: F.name }),
                              y.jsx('td', {
                                children:
                                  ((Me = F.organization) == null ? void 0 : Me.name) ??
                                  y.jsx('span', { className: 'text-muted', children: '—' }),
                              }),
                              y.jsx('td', { className: 'text-muted', children: qf(F.updatedAt) }),
                              y.jsx('td', {
                                style: { textAlign: 'right' },
                                children: y.jsx('button', {
                                  className: 'btn btn-secondary',
                                  onClick: () => void ce(F),
                                  disabled: L === F.id,
                                  children: L === F.id ? 'Downloading...' : 'Download JSON',
                                }),
                              }),
                            ],
                          },
                          F.id
                        )
                      }),
                      u.length === 0 &&
                        y.jsx('tr', {
                          style: { cursor: 'default' },
                          children: y.jsx('td', {
                            colSpan: 4,
                            className: 'text-muted',
                            style: { textAlign: 'center', padding: 24 },
                            children: 'No workspaces found',
                          }),
                        }),
                    ],
                  }),
                ],
              }),
        ],
      }),
    ],
  })
}
const Pi = eo().replace(/\/$/, '')
function zS() {
  const s = W.useSyncExternalStore(
    (a) => (window.addEventListener('popstate', a), () => window.removeEventListener('popstate', a)),
    () => window.location.pathname
  )
  return (s.startsWith(Pi) ? s.slice(Pi.length) : s) || '/'
}
function $i(s) {
  ;(window.history.pushState(null, '', `${Pi}${s}`), window.dispatchEvent(new PopStateEvent('popstate')))
}
function LS() {
  const [s, l] = W.useState(() => {
    const a = localStorage.getItem('admin_theme')
    return a ? a === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  return (
    W.useEffect(() => {
      ;(document.documentElement.classList.toggle('dark', s), localStorage.setItem('admin_theme', s ? 'dark' : 'light'))
    }, [s]),
    [s, () => l((a) => !a)]
  )
}
function Ml({ href: s, active: l, children: a }) {
  return y.jsx('a', {
    href: `${Pi}${s}`,
    className: l ? 'active' : '',
    onClick: (u) => {
      ;(u.preventDefault(), $i(s))
    },
    children: a,
  })
}
function RS() {
  const s = zS(),
    [l, a] = LS(),
    u = s.match(/^\/users\/(.+)$/),
    c = s.match(/^\/dashboard(?:\/(\w+))?$/),
    f = s === '/' || !!c,
    d = (c == null ? void 0 : c[1]) || 'overview',
    m = s === '/users' || !!u,
    g = s.startsWith('/templates'),
    p = s.startsWith('/llm-defaults'),
    _ = s.startsWith('/skills'),
    S = s.startsWith('/dev'),
    O = s === '/embed-templates',
    E = (u == null ? void 0 : u[1]) ?? null
  let U
  return (
    S
      ? (U = y.jsx(wb, {}))
      : _
        ? (U = y.jsx(kS, {}))
        : O
          ? (U = y.jsx(Lb, {}))
          : p
            ? (U = y.jsx(Rb, {}))
            : g
              ? (U = y.jsx(DS, {}))
              : E
                ? (U = y.jsx(Ab, { userId: E, onBack: () => $i('/users') }))
                : m
                  ? (U = y.jsx(xb, { onSelectUser: (A) => $i(`/users/${A}`) }))
                  : (U = y.jsx(zb, {
                      tab: d,
                      onTabChange: (A) => $i(`/dashboard/${A}`),
                      onNavigateUser: (A) => $i(`/users/${A}`),
                    })),
    y.jsxs('div', {
      className: 'layout',
      children: [
        y.jsxs('div', {
          className: 'sidebar',
          children: [
            y.jsx('div', { className: 'logo', children: y.jsx('img', { src: `${Pi}/logo.png`, alt: 'Kanwas' }) }),
            y.jsxs('nav', {
              children: [
                y.jsx(Ml, { href: '/', active: f, children: 'Dashboard' }),
                y.jsx('div', { className: 'nav-section', children: 'Manage' }),
                y.jsx(Ml, { href: '/users', active: m, children: 'Users' }),
                y.jsx(Ml, { href: '/skills', active: _, children: 'Skills' }),
                y.jsx(Ml, { href: '/embed-templates', active: O, children: 'Embed Templates' }),
                y.jsx(Ml, { href: '/templates', active: g, children: 'Templates' }),
                y.jsx(Ml, { href: '/llm-defaults', active: p, children: 'LLM Defaults' }),
                y.jsx('div', { className: 'nav-section', children: 'Dev' }),
                y.jsx(Ml, { href: '/dev', active: S, children: 'Dev Tools' }),
              ],
            }),
            y.jsxs('div', {
              className: 'sidebar-footer',
              children: [
                y.jsxs('button', {
                  className: 'theme-toggle',
                  onClick: a,
                  children: [
                    y.jsx('div', {
                      className: `theme-toggle-track${l ? ' active' : ''}`,
                      children: y.jsx('div', { className: 'theme-toggle-thumb' }),
                    }),
                    l ? 'Dark' : 'Light',
                  ],
                }),
                y.jsx('form', {
                  method: 'POST',
                  action: W0(),
                  children: y.jsx('button', { type: 'submit', children: 'Sign out' }),
                }),
              ],
            }),
          ],
        }),
        y.jsx('div', { className: 'main', children: U }),
      ],
    })
  )
}
K0.createRoot(document.getElementById('root')).render(y.jsx(W.StrictMode, { children: y.jsx(RS, {}) }))
