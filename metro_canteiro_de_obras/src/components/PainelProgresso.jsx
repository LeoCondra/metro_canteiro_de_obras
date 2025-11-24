import {
  Chart as ChartJS,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(LineElement, CategoryScale, LinearScale, PointElement);

export default function PainelProgresso({ progressoObra }) {
  if (!progressoObra || !progressoObra.length) return null;

  return (
    <div style={{ marginTop: 25 }}>
      <h3>Progressão da Obra</h3>

      <div style={{ height: "200px" }}>
        <Line
          data={{
            labels: progressoObra.map((p) => p.data),
            datasets: [
              {
                label: "Estado da Obra (%)",
                data: progressoObra.map((p) => p.porcentagem),
                borderColor: "#0050d6",
                backgroundColor: "rgba(0,80,214,.25)",
              },
            ],
          }}
        />
      </div>
    </div>
  );
}
