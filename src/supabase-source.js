/*
 * P05 data source: reads the shared BUS2010 Supabase database through its REST API
 * and maps the rows into exactly the P05_DATA shape that engine.js expects, so the
 * engine does not change. If the database cannot be reached, the caller falls back
 * to the built-in demo fixtures (src/data.js) and says so.
 *
 * Writing (recommendations, gap events, challenges) needs the P05 team key in the
 * x-team-key header. The key is never stored in this file.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.P05Source = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var PAGE = 1000;

  function config(over) { return Object.assign({}, root.P05_CONFIG || {}, over || {}); }
  function engine() { return root.P05Engine || (typeof require === 'function' ? require('./engine.js') : null); }

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error('Timed out after ' + ms + ' ms')); }, ms);
      promise.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }

  function headers(cfg, extra) {
    return Object.assign({ apikey: cfg.publishableKey, Accept: 'application/json' }, extra || {});
  }

  function request(cfg, path, opts) {
    opts = opts || {};
    var f = cfg.fetch || root.fetch;
    if (!f) return Promise.reject(new Error('fetch is not available'));
    return f(cfg.supabaseUrl + path, { method: opts.method || 'GET', headers: headers(cfg, opts.headers), body: opts.body })
      .then(function (res) {
        return res.text().then(function (text) {
          var body = null;
          try { body = text ? JSON.parse(text) : null; } catch (e) { body = text; }
          if (!res.ok) {
            var msg = body && body.message ? body.message : ('HTTP ' + res.status);
            var err = new Error(msg); err.status = res.status; err.body = body; throw err;
          }
          return body;
        });
      });
  }

  // Reads every row of a table or view, PAGE rows at a time.
  function fetchAll(cfg, table, query) {
    var out = [];
    function page(offset) {
      var q = '/rest/v1/' + table + '?' + (query ? query + '&' : '') + 'limit=' + PAGE + '&offset=' + offset;
      return request(cfg, q).then(function (rows) {
        out = out.concat(rows || []);
        return rows && rows.length === PAGE ? page(offset + PAGE) : out;
      });
    }
    return page(0);
  }

  // ---------- row mappers (pure; unit-tested in src/tests.js) ----------
  function mapVocabulary(rows) {
    return rows.map(function (r) { return { skill_id: r.skill_id, label: r.label, synonyms: r.synonyms || [], category: r.category }; })
      .sort(function (a, b) { return a.skill_id.localeCompare(b.skill_id); });
  }

  function mapProfiles(rows) {
    return rows.map(function (r) {
      return {
        student_id: r.student_id, name: r.full_name, profile_version: r.profile_version, published_at: r.published_at,
        change_note: r.change_note, goals: r.goals, sectors: r.sectors || [], roles: r.roles || [], locations: r.locations || [],
        work_arrangements: r.work_arrangements || [], availability: { start: r.available_from, end: r.available_to },
        skills: (r.skills || []).map(function (s) { return { skill_id: s.skill_id, source: s.source, evidence_id: s.evidence_id || null, review_date: s.review_date || null }; }),
        unmapped_skills: r.unmapped_skills || []
      };
    });
  }

  function mapCondition(c) {
    if (c.kind === 'skill') return { kind: 'skill', skill_id: c.skill_id };
    if (c.kind === 'availability') return { kind: 'availability' };
    return { kind: 'arrangement', arrangements: c.arrangements || [], city: c.city };
  }

  function mapListings(rows) {
    var byId = {}, order = [];
    rows.forEach(function (r) {
      var L = byId[r.opportunity_id];
      if (!L) {
        L = byId[r.opportunity_id] = { opportunity_id: r.opportunity_id, approved_version: r.approved_version, listing_status: r.listing_status, closed_on: r.closed_on || null, versions: {} };
        order.push(r.opportunity_id);
      }
      L.versions[r.version] = {
        title: r.title, employer: r.employer, city: r.city, work_arrangement: r.work_arrangement, start_date: r.start_date, end_date: r.end_date,
        sector: r.sector, role_family: r.role_family, description: r.description,
        mandatory: (r.mandatory || []).map(mapCondition), desirable: (r.desirable || []).map(mapCondition)
      };
    });
    return order.sort().map(function (id) { return byId[id]; });
  }

  function mapEvidence(rows) {
    return rows.map(function (r) {
      return { evidence_id: r.evidence_id, student_id: r.student_id, skill_id: r.skill_id, activity: r.activity, outcome: r.review_outcome, reviewer: r.reviewer, review_date: r.reviewed_at };
    });
  }

  // ---------- load everything P05 reads ----------
  function load(fallback, over) {
    var cfg = config(over);
    if (!cfg.supabaseUrl || !cfg.publishableKey) return Promise.reject(new Error('No database configured'));
    var started = Date.now();
    return withTimeout(Promise.all([
      fetchAll(cfg, 'skills', 'select=skill_id,label,synonyms,category'),
      fetchAll(cfg, 'profile_feed', 'select=*&order=student_id,profile_version'),
      fetchAll(cfg, 'opportunity_feed', 'select=*&order=opportunity_id,version'),
      fetchAll(cfg, 'skill_evidence', 'select=evidence_id,student_id,skill_id,activity,review_outcome,reviewer,reviewed_at&review_outcome=eq.demonstrated&order=evidence_id'),
      fetchAll(cfg, 'coordinator_labels', 'select=student_id,opportunity_id,label,labelled_by,note')
    ]), cfg.timeoutMs || 8000).then(function (r) {
      var data = {
        meta: {
          dataset: 'BUS2010 shared database (synthetic)', fixtures_version: 'live',
          note: 'Live from the shared BUS2010 database. All people, employers and records are invented for classroom use.'
        },
        vocabulary: mapVocabulary(r[0]),
        profiles: mapProfiles(r[1]),
        listings: mapListings(r[2]),
        evidence: mapEvidence(r[3]),
        labels: r[4],
        dictionary: (fallback && fallback.dictionary) || [],
        ai: { model: engine().AI_MODEL, source: 'live', goals: {}, phrases: {} }
      };
      if (!data.profiles.length || !data.listings.length) throw new Error('The database returned no profiles or listings');
      return {
        data: data,
        source: {
          mode: 'live', url: cfg.supabaseUrl, loadedAt: new Date().toISOString(), ms: Date.now() - started,
          counts: { students: countStudents(data.profiles), profile_versions: data.profiles.length, listings: data.listings.length, skills: data.vocabulary.length, evidence: data.evidence.length }
        }
      };
    });
  }

  function countStudents(profiles) {
    var seen = {}; profiles.forEach(function (p) { seen[p.student_id] = 1; }); return Object.keys(seen).length;
  }

  // ---------- AI signals for one profile (goal similarity + phrase suggestions) ----------
  function loadAi(data, profile, over) {
    var cfg = config(over), E = engine();
    var key = E.textKey(profile.goals);
    var phrases = (profile.unmapped_skills || []).filter(function (p) { return !data.ai.phrases[p]; });
    if (data.ai.goals[key] && !phrases.length) return Promise.resolve(false);
    return withTimeout(request(cfg, '/rest/v1/rpc/ai_signals', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_goal: profile.goals || '', p_phrases: phrases.slice(0, 20) })
    }), cfg.timeoutMs || 8000).then(function (res) {
      if (res && res.goal_embedded) data.ai.goals[key] = res.goal;
      Object.keys((res && res.phrases) || {}).forEach(function (p) { data.ai.phrases[p] = res.phrases[p]; });
      // Sprint 3: text written after the seed (for example by another team) has no stored
      // embedding yet. Ask the live model for it instead of falling back to word overlap.
      var live = [];
      if (!(res && res.goal_embedded) && profile.goals) live.push(liveGoal(cfg, profile.goals).then(function (g) { data.ai.goals[key] = g; }));
      phrases.filter(function (p) { return !data.ai.phrases[p]; }).slice(0, 3).forEach(function (p) {
        live.push(suggest(p, over).then(function (r) {
          data.ai.phrases[p] = (r.suggestions || []).map(function (s) { return { skill_id: s.skill_id, score: s.similarity }; });
        }));
      });
      return Promise.all(live.map(function (pr) { return pr.catch(function () { return null; }); }))
        .then(function () { return !!data.ai.goals[key]; });
    });
  }

  function liveGoal(cfg, goal) {
    return withTimeout(request(cfg, '/functions/v1/' + (cfg.aiFunction || 'ai-suggest'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goal: String(goal).slice(0, 600) })
    }), 25000).then(function (r) {
      if (!r || !r.goal) throw new Error('No similarity returned');
      return r.goal;
    });
  }

  // ---------- live suggestion for a new phrase (Edge Function, gte-small) ----------
  function suggest(phrase, over) {
    var cfg = config(over);
    return withTimeout(request(cfg, '/functions/v1/' + (cfg.aiFunction || 'ai-suggest'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phrase: phrase })
    }), 20000);
  }

  // ---------- writes (P05 key only) ----------
  function whoami(teamKey, over) {
    var cfg = config(over);
    return request(cfg, '/rest/v1/rpc/whoami', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-team-key': teamKey }, body: '{}' });
  }

  function insertRows(table, rows, teamKey, over) {
    var cfg = config(over);
    if (!teamKey) return Promise.reject(new Error('No team key'));
    return request(cfg, '/rest/v1/' + table, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-team-key': teamKey, Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(rows)
    });
  }

  function recommendationRow(rec, rank) {
    return {
      recommendation_id: rec.recommendation_id, student_id: rec.student_id, profile_version: rec.profile_version,
      opportunity_id: rec.opportunity_id, opportunity_version: rec.opportunity_version, method_id: rec.method_version.replace(/\+fallback$/, ''),
      status: rec.status, status_reason: rec.status_reason, rank: rank || null, pref_points: rec.pref_points,
      reasons: rec.reasons, gaps: rec.gaps, unknowns: rec.unknowns, mandatory: rec.mandatory, desirable: rec.desirable, ai_notes: rec.ai_notes,
      computed_at: rec.created_at
    };
  }

  return {
    load: load, loadAi: loadAi, suggest: suggest, whoami: whoami, insertRows: insertRows, recommendationRow: recommendationRow,
    mapVocabulary: mapVocabulary, mapProfiles: mapProfiles, mapListings: mapListings, mapEvidence: mapEvidence
  };
});
