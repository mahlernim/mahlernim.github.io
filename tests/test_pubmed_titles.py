import xml.etree.ElementTree as ET

from scripts import fetch_pubmed


def test_mixed_title_keeps_scientific_notation_and_following_text():
    element = ET.fromstring(
        '<ArticleTitle> PGE<sub>2</sub> and Ca<sup>2+</sup> in '
        '<i>human <b>cells</b></i>: a study. </ArticleTitle>'
    )
    assert fetch_pubmed.publication_title(element) == "PGE₂ and Ca²⁺ in human cells: a study."
    assert fetch_pubmed.publication_title(None) == ""


def test_pubmed_import_does_not_truncate_at_inline_markup(monkeypatch):
    class Response:
        status_code = 200
        content = b'''<PubmedArticleSet><PubmedArticle><MedlineCitation>
          <PMID>41893027</PMID><Article>
            <ArticleTitle>UDP-Glucuronosyltransferase-Mediated PGE<sub>2</sub> Glucuronidation.</ArticleTitle>
            <Journal><JournalIssue><PubDate><Year>2026</Year></PubDate></JournalIssue>
              <ISOAbbreviation>J Pers Med</ISOAbbreviation></Journal>
          </Article></MedlineCitation></PubmedArticle></PubmedArticleSet>'''

    monkeypatch.setattr(fetch_pubmed.requests, "get", lambda *args, **kwargs: Response())
    records = fetch_pubmed.fetch_details(["41893027"])
    assert len(records) == 1
    assert records[0]["title"] == "UDP-Glucuronosyltransferase-Mediated PGE₂ Glucuronidation."
