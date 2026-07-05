"""Firewall de contenido para prompts que van a LLM (transcripts de reuniones)."""
import logging
import re
from dataclasses import dataclass, field
from re import Pattern
from typing import Dict, List

logger = logging.getLogger(__name__)

_BLOCKED_WORDS = frozenset({
    "hackear", "matar", "bomba", "suicidio", "ilegal", "violación",
    "secuestro", "asesinato", "robo", "extorsión", "terrorismo",
})

_SQL_PATTERNS = [
    r"'.*?OR.*?'.*?\s*=\s*'.*?'",
    r";\s*(DROP|ALTER|TRUNCATE|DELETE)\s+TABLE",
    r"UNION\s+(ALL\s+)?SELECT",
    r"/\*.*?\*/",
    r"EXEC(\s|\+)+(s|x)p\w+",
]

_JAILBREAK_PATTERNS = [
    r"ignora\s+(todas\s+)?las\s+instrucciones\s+(anteriores|previas)",
    r"ignore\s+all\s+previous\s+instructions",
    r"system\s+prompt",
    r"\bDAN\b|Do\s+Anything\s+Now",
    r"tú\s+eres\s+ahora|you\s+are\s+now",
    r"actúa\s+como|act\s+as\s+an\s+unfiltered",
    r"desactiva\s+tus\s+filtros|disable\s+your\s+filters",
]

_PII_PATTERNS: Dict[str, str] = {
    "EMAIL": r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z]{2,}",
    "CREDIT_CARD": r"\b(?:\d{4}[ -]?){3}\d{4}\b",
    "PHONE": r"\+[1-9]\d{6,14}\b",
}


@dataclass
class ReportMain:
    is_content_safe: bool = True
    content_report_time: int = 0
    compres_hilos_detect: List[str] = field(default_factory=list)
    prompt_data: str = ""


class Firewall:
    def __init__(self, risk_method: int = 50):
        self.method_risk = risk_method
        flags = re.IGNORECASE
        self._sql_patt: List[Pattern[str]] = [re.compile(p, flags) for p in _SQL_PATTERNS]
        self._jailbreak_patt: List[Pattern[str]] = [re.compile(p, flags) for p in _JAILBREAK_PATTERNS]
        self._pii_patt: Dict[str, Pattern[str]] = {
            name: re.compile(patt, flags) for name, patt in _PII_PATTERNS.items()
        }

    def _check_blocked_words(self, prompt: str, report: ReportMain) -> None:
        words = set(re.findall(r"\b\w+\b", prompt.lower(), flags=re.UNICODE))
        found = words & _BLOCKED_WORDS
        if found:
            report.content_report_time += len(found) * 30
            report.compres_hilos_detect.append(
                f"Palabras prohibidas: {', '.join(sorted(found))}"
            )

    def _check_sql(self, prompt: str, report: ReportMain) -> None:
        for patt in self._sql_patt:
            if patt.search(prompt):
                report.content_report_time += 80
                report.compres_hilos_detect.append("ERROR CONTIENE SQL MALICIOSO")
                break

    def _check_jailbreak(self, prompt: str, report: ReportMain) -> None:
        for patt in self._jailbreak_patt:
            if patt.search(prompt):
                report.content_report_time += 100
                report.compres_hilos_detect.append("JAILBREAK INTENTO ENCONTRADO")
                break

    def _redact_pii(self, prompt: str, report: ReportMain) -> str:
        redacted = prompt
        found_pii = False
        for pii_type, patt in self._pii_patt.items():
            if patt.search(redacted):
                found_pii = True
                redacted = patt.sub(f"[REDACTED_{pii_type}]", redacted)
        if found_pii:
            report.content_report_time += 20
            report.compres_hilos_detect.append("DATA PERSONAL IDENTIFICATION FOUND")
        return redacted

    def session_scan_id(self, prompt: str) -> ReportMain:
        report = ReportMain(prompt_data=prompt)
        report.prompt_data = self._redact_pii(prompt, report)
        self._check_jailbreak(prompt, report)
        self._check_sql(prompt, report)
        self._check_blocked_words(report.prompt_data, report)

        if report.content_report_time >= self.method_risk:
            report.is_content_safe = False
            logger.warning(
                "Prompt BLOQUEADO! Puntuación de riesgo: %s", report.content_report_time
            )
        else:
            logger.info("Prompt permitido.")

        return report


_default_firewall = Firewall()


def scan_prompt(prompt: str) -> ReportMain:
    """Escanea un prompt con la instancia por defecto del firewall."""
    return _default_firewall.session_scan_id(prompt)
