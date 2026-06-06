"""In-memory semantic index (embeddings or TF-IDF fallback)."""

from __future__ import annotations

import math
import re
from collections import Counter

_WORD = re.compile(r"[a-z0-9']+", re.I)


def _tokenize(text: str) -> list[str]:
    return [t.lower() for t in _WORD.findall(text)]


class SemanticIndex:
  """Per-user conversation document store for search."""

  def __init__(self) -> None:
      self._docs: dict[str, list[dict]] = {}

  def _key(self, user_id: str, conversation_id: str | None) -> str:
      return f"{user_id}:{conversation_id or '_all'}"

  def upsert_batch(
      self,
      user_id: str,
      conversation_id: str | None,
      docs: list[dict],
  ) -> None:
      key = self._key(user_id, conversation_id)
      by_id = {d["id"]: d for d in self._docs.get(key, [])}
      for doc in docs:
          by_id[doc["id"]] = doc
      self._docs[key] = list(by_id.values())[-500:]

  def search(
      self,
      user_id: str,
      conversation_id: str | None,
      query: str,
      *,
      mode: str,
      limit: int,
      inline_docs: list[dict] | None = None,
  ) -> list[dict]:
      key = self._key(user_id, conversation_id)
      docs = inline_docs if inline_docs else self._docs.get(key, [])
      if not docs:
          return []

      q_tokens = _tokenize(query)
      if not q_tokens:
          return []

      if mode == "keyword":
          return self._keyword_search(docs, q_tokens, limit)

      return self._semantic_search(docs, q_tokens, query, limit)

  def _keyword_search(self, docs: list[dict], q_tokens: list[str], limit: int) -> list[dict]:
      hits: list[dict] = []
      q_set = set(q_tokens)
      for doc in docs:
          tokens = set(_tokenize(doc["text"]))
          overlap = len(q_set & tokens)
          if overlap == 0:
              continue
          hits.append(
              {
                  "id": doc["id"],
                  "text": doc["text"],
                  "sent_at": doc.get("sent_at"),
                  "score": overlap / len(q_set),
                  "match_type": "keyword",
              }
          )
      hits.sort(key=lambda h: h["score"], reverse=True)
      return hits[:limit]

  def _semantic_search(self, docs: list[dict], q_tokens: list[str], query: str, limit: int) -> list[dict]:
      """TF-IDF cosine similarity as lightweight semantic fallback."""
      doc_tokens = [_tokenize(d["text"]) for d in docs]
      df: Counter[str] = Counter()
      for tokens in doc_tokens:
          df.update(set(tokens))
      n = len(docs)

      def tfidf_vec(tokens: list[str]) -> dict[str, float]:
          tf = Counter(tokens)
          total = max(len(tokens), 1)
          vec: dict[str, float] = {}
          for term, count in tf.items():
              idf = math.log((1 + n) / (1 + df[term])) + 1
              vec[term] = (count / total) * idf
          return vec

      q_vec = tfidf_vec(q_tokens)
      hits: list[dict] = []
      for doc, tokens in zip(docs, doc_tokens, strict=False):
          d_vec = tfidf_vec(tokens)
          score = _cosine(q_vec, d_vec)
          # Boost exact phrase
          if query.lower() in doc["text"].lower():
              score = min(1.0, score + 0.25)
          if score < 0.05:
              continue
          hits.append(
              {
                  "id": doc["id"],
                  "text": doc["text"],
                  "sent_at": doc.get("sent_at"),
                  "score": round(score, 4),
                  "match_type": "semantic",
              }
          )
      hits.sort(key=lambda h: h["score"], reverse=True)
      return hits[:limit]


def _cosine(a: dict[str, float], b: dict[str, float]) -> float:
    if not a or not b:
        return 0.0
    dot = sum(a.get(k, 0) * b.get(k, 0) for k in set(a) | set(b))
    na = math.sqrt(sum(v * v for v in a.values()))
    nb = math.sqrt(sum(v * v for v in b.values()))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


semantic_index = SemanticIndex()
