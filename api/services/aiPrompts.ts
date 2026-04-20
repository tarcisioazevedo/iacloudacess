export const SYSTEM_ANALYTICS = `
Você é um assistente analítico especializado em gestão escolar e controle de acesso biométrico.
Recebe dados numéricos agregados e anonimizados (contagens, taxas, tendências) e gera insights
em português brasileiro, objetivos e acionáveis para gestores escolares.

REGRAS OBRIGATÓRIAS:
- NUNCA cite dados pessoais de alunos, responsáveis ou funcionários
- Foque em padrões operacionais: pontualidade, taxa de presença, horários de pico, anomalias
- Resposta máxima: 3 parágrafos curtos OU 5 bullets bem definidos
- Tom: profissional e direto, sem jargão técnico desnecessário
- Encerre sempre com uma recomendação prática e imediata
- Use números concretos quando disponíveis nos dados
`.trim();

export const SYSTEM_NL_QUERY = `
Você converte perguntas em linguagem natural para parâmetros de consulta JSON estruturados.
Retorne SOMENTE o JSON, sem explicações ou texto adicional.
Formato obrigatório: { "metric": string, "filters": object, "groupBy": string, "period": string, "intent": string }
Métricas disponíveis: attendance_rate, total_entries, total_exits, late_arrivals, denied_events, peak_hour, unique_students, device_uptime.
Períodos: today, week, month, quarter, custom.
`.trim();

export function promptAttendanceInsight(data: unknown, period: string, schoolName: string): string {
  return `Analise os dados de presença da escola "${schoolName}" no período: ${period}

Dados agregados (sem PII):
${JSON.stringify(data, null, 2)}

Forneça:
1. Resumo executivo em 2 frases
2. Principal problema identificado (se houver)
3. Tendência: melhorando / estável / piorando (com justificativa em 1 frase)
4. Uma recomendação acionável para o gestor`;
}

export function promptPeriodSummary(data: unknown, period: string): string {
  return `Gere um relatório executivo para o período "${period}" com base nos dados abaixo:

${JSON.stringify(data, null, 2)}

Inclua:
- Métricas-chave do período
- Variação em relação ao período anterior (se disponível)
- Destaque positivo e principal ponto de atenção
- Próxima ação recomendada`;
}

export function promptAnomalyDetect(data: unknown): string {
  return `Identifique anomalias nos dados de acesso escolar abaixo.
Anomalias incluem: picos incomuns de entrada/saída, taxa de presença atipicamente baixa, horários fora do padrão, aumento de negações de acesso.

Dados:
${JSON.stringify(data, null, 2)}

Retorne um JSON com o seguinte formato exato (sem texto fora do JSON):
{ "anomalies": [ { "type": string, "severity": "low"|"medium"|"high", "description": string, "suggestedAction": string } ] }`;
}

export function promptComparativePeriod(current: unknown, previous: unknown, period: string): string {
  return `Compare os dados de acesso escolar entre dois períodos consecutivos (${period}).

Período atual:
${JSON.stringify(current, null, 2)}

Período anterior:
${JSON.stringify(previous, null, 2)}

Gere um relatório comparativo com:
- % de variação nas métricas principais
- O que melhorou e o que piorou
- Causa provável das variações (baseada nos padrões observados)
- Recomendação para o próximo período`;
}

export function promptNLAnswer(question: string, context: unknown): string {
  return `Pergunta do gestor escolar: "${question}"

Contexto disponível (dados anonimizados):
${JSON.stringify(context, null, 2)}

Responda de forma direta e objetiva em até 3 frases, usando os dados disponíveis.
Se a pergunta não puder ser respondida com os dados fornecidos, informe isso claramente e sugira qual relatório consultar.`;
}
