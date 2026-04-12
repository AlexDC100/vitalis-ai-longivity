import { useHealth } from "@/lib/health-context";
import { Button } from "@/components/ui/button";
import { Video, Calendar, Star, Clock, Stethoscope } from "lucide-react";

const doctors = [
  { name: "Dr. Sarah Chen", specialty: "Longevity Medicine", rating: 4.9, reviews: 312, available: true, price: 250, avatar: "SC" },
  { name: "Dr. James Park", specialty: "Cardiology", rating: 4.8, reviews: 245, available: true, price: 300, avatar: "JP" },
  { name: "Dr. Maria Rodriguez", specialty: "Endocrinology", rating: 4.9, reviews: 189, available: false, price: 275, avatar: "MR" },
  { name: "Dr. David Kim", specialty: "Sports Medicine", rating: 4.7, reviews: 156, available: true, price: 200, avatar: "DK" },
  { name: "Dr. Lisa Thompson", specialty: "Metabolic Health", rating: 4.8, reviews: 203, available: false, price: 225, avatar: "LT" },
  { name: "Dr. Robert Williams", specialty: "Functional Medicine", rating: 4.6, reviews: 178, available: true, price: 275, avatar: "RW" },
];

export default function MedicalTeam() {
  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Medical Team</h1>
          <span className="px-2 py-0.5 text-xs font-semibold rounded bg-vitalis-success/20 text-vitalis-success">Live</span>
        </div>
        <p className="text-sm text-muted-foreground">Board-certified specialists available for consultation</p>
      </div>

      <div className="grid gap-4">
        {doctors.map((doc) => (
          <div key={doc.name} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4 hover:border-primary/30 transition-colors">
            <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center text-sm font-bold text-primary flex-shrink-0">
              {doc.avatar}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-foreground">{doc.name}</h3>
                {doc.available && <span className="w-2 h-2 rounded-full bg-vitalis-success" />}
              </div>
              <p className="text-xs text-muted-foreground">{doc.specialty}</p>
              <div className="flex items-center gap-3 mt-1">
                <span className="flex items-center gap-1 text-xs text-vitalis-warning"><Star className="w-3 h-3" /> {doc.rating}</span>
                <span className="text-xs text-muted-foreground">{doc.reviews} reviews</span>
                <span className="text-xs text-foreground font-medium">${doc.price}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="vitalis-outline" size="sm" disabled={!doc.available}>
                <Video className="w-3.5 h-3.5 mr-1" /> Video
              </Button>
              <Button variant="vitalis-ghost" size="sm">
                <Calendar className="w-3.5 h-3.5 mr-1" /> Book
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
