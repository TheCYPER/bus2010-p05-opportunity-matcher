/*
 * P05 evaluation: compares the rules baseline with the AI method against labelled pairs.
 *
 * The 30 labels below are PROVISIONAL. Team 5 wrote them as a stand-in so the comparison
 * can run in Sprint 2; a real coordinator should replace them (table coordinator_labels).
 * A label judges how well a job suits a student's goals and interests. It is not a hiring
 * decision, and agreement with labels says nothing about hiring accuracy.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.P05Eval = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LABELLER = 'Team 5 stand-in (provisional, not a coordinator)';
  var RAW = {
    'COOP-B001': { 'OP-028': 'good_fit', 'OP-026': 'possible', 'OP-027': 'possible', 'OP-029': 'not_fit', 'OP-031': 'not_fit' },
    'COOP-B002': { 'OP-027': 'good_fit', 'OP-026': 'possible', 'OP-028': 'possible', 'OP-029': 'not_fit', 'OP-031': 'not_fit' },
    'COOP-B003': { 'OP-028': 'good_fit', 'OP-026': 'possible', 'OP-027': 'not_fit', 'OP-029': 'not_fit', 'OP-031': 'not_fit' },
    'COOP-B004': { 'OP-029': 'good_fit', 'OP-027': 'possible', 'OP-028': 'not_fit', 'OP-026': 'not_fit', 'OP-031': 'not_fit' },
    'COOP-B005': { 'OP-031': 'good_fit', 'OP-026': 'possible', 'OP-028': 'possible', 'OP-027': 'not_fit', 'OP-029': 'not_fit' },
    'COOP-B006': { 'OP-029': 'possible', 'OP-028': 'not_fit', 'OP-026': 'not_fit', 'OP-027': 'not_fit', 'OP-031': 'not_fit' }
  };
  var LABELS = [];
  Object.keys(RAW).forEach(function (sid) {
    Object.keys(RAW[sid]).forEach(function (o) { LABELS.push({ student_id: sid, opportunity_id: o, label: RAW[sid][o], labelled_by: LABELLER }); });
  });
  var SCORE = { good_fit: 2, possible: 1, not_fit: 0 };

  function pct(a, b) { return b ? Math.round(1000 * a / b) / 10 : null; }

  // Pairwise agreement: over pairs with different labels, the share the method puts in label order.
  function pairwise(items, key) {
    var agree = 0, n = 0;
    for (var i = 0; i < items.length; i++) {
      for (var j = i + 1; j < items.length; j++) {
        var a = items[i], b = items[j];
        if (a.score === b.score) continue;
        n++;
        var d = key(a) - key(b);
        if (d === 0) agree += 0.5;
        else if ((d > 0) === (a.score > b.score)) agree += 1;
      }
    }
    return { agree: agree, n: n };
  }

  function compare(E, data, labels) {
    labels = (labels || LABELS).filter(function (l) { return !/probe/i.test(l.labelled_by || ''); });
    var byStudent = {};
    labels.forEach(function (l) { (byStudent[l.student_id] = byStudent[l.student_id] || {})[l.opportunity_id] = SCORE[l.label]; });
    var platform = E.createPlatform(data);
    var out = { pairs: labels.length, students: Object.keys(byStudent).length, labelled_by: labels[0] ? labels[0].labelled_by : null, methods: {}, eligibility_changed: 0, per_student: [] };
    var statusByFam = { rules: {}, ai: {} };
    ['rules', 'ai'].forEach(function (fam) {
      var top1 = 0, top1n = 0, rankAgree = 0, rankN = 0, prefAgree = 0, prefN = 0, method = null, aiSources = {};
      Object.keys(byStudent).forEach(function (sid) {
        if (!platform.currentProfile(sid)) return;
        var set = platform.computeSet(sid, fam);
        method = set.method.method_version;
        var items = set.records
          .filter(function (r) { return byStudent[sid][r.opportunity_id] != null && r.status !== 'excluded'; })
          .map(function (r, i) {
            statusByFam[fam][sid + '|' + r.opportunity_id] = r.status;
            if (r.ai_source) aiSources[r.ai_source] = (aiSources[r.ai_source] || 0) + 1;
            return { id: r.opportunity_id, score: byStudent[sid][r.opportunity_id], pos: -i, points: r.pref_points };
          });
        if (items.length) { top1n++; if (items[0].score === 2) top1++; }
        var pr = pairwise(items, function (x) { return x.pos; });
        var pp = pairwise(items, function (x) { return x.points; });
        rankAgree += pr.agree; rankN += pr.n; prefAgree += pp.agree; prefN += pp.n;
        if (fam === 'ai') out.per_student.push({ student_id: sid, top: items[0] ? items[0].id : null });
      });
      out.methods[fam] = { method_version: method, top1: pct(top1, top1n), pairwise_rank: pct(rankAgree, rankN), pairwise_interest: pct(prefAgree, prefN), compared_pairs: rankN, ai_sources: aiSources };
    });
    Object.keys(statusByFam.rules).forEach(function (k) { if (statusByFam.ai[k] !== statusByFam.rules[k]) out.eligibility_changed++; });
    return out;
  }

  return { LABELS: LABELS, LABELLER: LABELLER, compare: compare };
});
