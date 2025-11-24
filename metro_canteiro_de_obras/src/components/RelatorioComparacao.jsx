export default function RelatorioComparacao({ report }) {
  if (!report) return null;

  const p = Number(report.progresso_global).toFixed(1);

  const linhas = Object.entries(report.detalhePorClasse || {}).map(
    ([cls, det]) => ({ ...det, cls })
  );

  return (
    <div style={{ marginTop: 25 }}>
      <h3>Resultado da Comparação</h3>

      <div className="dashboard-cards">
        <div className="dash-card">
          <h4>Progresso</h4>
          <p>{p}%</p>
        </div>
      </div>

      <div className="report success">
        <p>
          <strong>Resumo:</strong> {report.textoFaltas}
        </p>

        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table className="relatorio-tabela">
            <thead>
              <tr>
                <th>Classe</th>
                <th>Esperado</th>
                <th>Detectado</th>
                <th>Atendido</th>
                <th>Faltando</th>
              </tr>
            </thead>

            <tbody>
              {linhas.length > 0 ? (
                linhas.map((l, i) => (
                  <tr key={i}>
                    <td>{l.cls}</td>
                    <td>{l.esperado}</td>
                    <td>{l.detectado}</td>
                    <td>{l.atendido}</td>
                    <td>{l.faltando}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>Sem classes detectadas</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
