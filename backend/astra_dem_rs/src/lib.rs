use pyo3::exceptions::{PyRuntimeError, PyValueError};
use pyo3::prelude::*;
use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashMap};
use std::f64::consts::PI;
use std::fs::File;
use std::io::{BufReader, Read};
use std::path::PathBuf;
use std::sync::OnceLock;

const MARS_RADIUS_KM: f64 = 3396.19;
const NODATA: i16 = -32768;

#[derive(Clone)]
struct Dem {
    width: usize,
    height: usize,
    ppd: f64,
    data: Vec<i16>, // row-major, big-endian values decoded
}

static DEM: OnceLock<Result<Dem, String>> = OnceLock::new();

fn deg2rad(d: f64) -> f64 { d * PI / 180.0 }
fn rad2deg(r: f64) -> f64 { r * 180.0 / PI }

fn dem_grid_from_path(path: &PathBuf) -> PyResult<(usize, usize, f64)> {
    let meta = std::fs::metadata(path).map_err(|e| PyRuntimeError::new_err(format!("cannot stat DEM: {e}")))?;
    let size = meta.len() as usize;
    let lbl = path.with_extension("lbl");
    if lbl.exists() {
        if let Ok(text) = std::fs::read_to_string(&lbl) {
            let mut samples: Option<usize> = None;
            let mut lines: Option<usize> = None;
            for line in text.lines() {
                let l = line.trim();
                if l.starts_with("LINE_SAMPLES") {
                    if let Some(eq) = l.split('=').nth(1) { samples = eq.trim().parse().ok(); }
                } else if l.starts_with("LINES") {
                    if let Some(eq) = l.split('=').nth(1) { lines = eq.trim().parse().ok(); }
                }
            }
            if let (Some(w), Some(h)) = (samples, lines) {
                if w * h * 2 == size { return Ok((w, h, w as f64 / 360.0)); }
            }
        }
    }
    let height = ((size as f64 / 4.0).sqrt()).round() as usize;
    let width = 2 * height;
    if width * height * 2 == size {
        Ok((width, height, width as f64 / 360.0))
    } else {
        Err(PyRuntimeError::new_err(format!("Cannot determine DEM dimensions for {} ({size} bytes)", path.display())))
    }
}

fn load_dem(path: &PathBuf) -> Result<Dem, String> {
    let (width, height, ppd) = dem_grid_from_path(path).map_err(|e| e.to_string())?;
    let file = File::open(path).map_err(|e| format!("cannot open DEM: {e}"))?;
    let mut reader = BufReader::new(file);
    let mut bytes = Vec::with_capacity(width * height * 2);
    reader.read_to_end(&mut bytes).map_err(|e| format!("cannot read DEM: {e}"))?;
    if bytes.len() != width * height * 2 { return Err("DEM size mismatch".into()); }
    let mut data = vec![0i16; width * height];
    for (i, chunk) in bytes.chunks_exact(2).enumerate() {
        data[i] = i16::from_be_bytes([chunk[0], chunk[1]]);
    }
    Ok(Dem { width, height, ppd, data })
}

fn get_dem(path: &str) -> PyResult<&'static Dem> {
    let pathbuf = PathBuf::from(path);
    let res = DEM.get_or_init(|| load_dem(&pathbuf));
    match res {
        Ok(d) => Ok(d),
        Err(e) => Err(PyRuntimeError::new_err(e.clone())),
    }
}

fn normalize_lon(lon: f64) -> f64 {
    let mut lon_mod = lon % 360.0;
    if lon_mod < 0.0 { lon_mod += 360.0; }
    lon_mod
}

fn sample_elevation(dem: &Dem, lon: f64, lat: f64) -> Option<f64> {
    let lon_mod = normalize_lon(lon);
    let x = lon_mod * dem.ppd - 0.5;
    let y = (90.0 - lat) * dem.ppd - 0.5;
    let x_floor = x.floor() as isize;
    let y_floor = y.floor() as isize;
    let fx = x - x_floor as f64;
    let fy = y - y_floor as f64;
    let w = dem.width as isize;
    let h = dem.height as isize;
    let x0 = ((x_floor % w) + w) % w;
    let x1 = (x0 + 1) % w;
    let y0 = y_floor.clamp(0, h - 1);
    let y1 = (y0 + 1).min(h - 1);
    let idx = |yy: isize, xx: isize| -> i16 { dem.data[(yy as usize) * dem.width + (xx as usize)] };
    let v00 = idx(y0, x0); let v01 = idx(y0, x1); let v10 = idx(y1, x0); let v11 = idx(y1, x1);
    let corners = [v00, v01, v10, v11];
    if corners.iter().any(|&v| v == NODATA) {
        let mut sum = 0.0f64; let mut count = 0usize;
        for &v in &corners { if v != NODATA { sum += v as f64; count += 1; } }
        if count == 0 { return None; }
        return Some(sum / count as f64);
    }
    let top = v00 as f64 + (v01 as f64 - v00 as f64) * fx;
    let bottom = v10 as f64 + (v11 as f64 - v10 as f64) * fx;
    Some(top + (bottom - top) * fy)
}

fn vector(lon: f64, lat: f64) -> (f64, f64, f64) {
    let lon_r = deg2rad(lon);
    let lat_r = deg2rad(lat);
    let cos_lat = lat_r.cos();
    (cos_lat * lon_r.cos(), cos_lat * lon_r.sin(), lat_r.sin())
}

fn omega(a: (f64,f64,f64), b: (f64,f64,f64)) -> f64 {
    let dot = (a.0*b.0 + a.1*b.1 + a.2*b.2).clamp(-1.0, 1.0);
    dot.acos()
}

fn great_circle_km(lon1: f64, lat1: f64, lon2: f64, lat2: f64) -> f64 {
    MARS_RADIUS_KM * omega(vector(lon1, lat1), vector(lon2, lat2))
}

#[pyfunction]
fn elevation_m(path: &str, lon: f64, lat: f64) -> PyResult<Option<f64>> {
    let dem = get_dem(path)?;
    Ok(sample_elevation(dem, lon, lat))
}

#[pyfunction]
fn heightmap(path: &str, west: f64, south: f64, east: f64, north: f64, width: usize, height: usize) -> PyResult<Vec<f32>> {
    let dem = get_dem(path)?;
    if width < 2 || height < 2 { return Err(PyValueError::new_err("invalid size")); }
    let mut out = vec![0.0f32; width * height];
    for j in 0..height {
        let t_lat = if height == 1 { 0.0 } else { j as f64 / (height - 1) as f64 };
        let lat = north + (south - north) * t_lat;
        for i in 0..width {
            let t_lon = if width == 1 { 0.0 } else { i as f64 / (width - 1) as f64 };
            let lon = west + (east - west) * t_lon;
            out[j * width + i] = sample_elevation(dem, lon, lat).unwrap_or(0.0) as f32;
        }
    }
    Ok(out)
}

#[pyfunction]
fn slope_rgba(path: &str, west: f64, south: f64, east: f64, north: f64, size: usize) -> PyResult<Vec<u8>> {
    let dem = get_dem(path)?;
    if size < 1 { return Err(PyValueError::new_err("invalid size")); }
    let w = size + 1; let h = size + 1;
    let mut grid = vec![0.0f64; w * h];
    for j in 0..h {
        let t_lat = j as f64 / size as f64;
        let lat = north + (south - north) * t_lat;
        for i in 0..w {
            let t_lon = i as f64 / size as f64;
            let lon = west + (east - west) * t_lon;
            grid[j * w + i] = sample_elevation(dem, lon, lat).unwrap_or(0.0);
        }
    }
    let radius_m = MARS_RADIUS_KM * 1000.0;
    let mid_lat = (north + south) / 2.0;
    let step_x = (east - west).abs() * PI / 180.0 * radius_m * deg2rad(mid_lat).cos().abs().max(1e-9) / size as f64;
    let step_y = (north - south).abs() * PI / 180.0 * radius_m / size as f64;
    let breaks = [5.0f64, 10.0, 15.0, 25.0];
    let colors: [[u8;4];4] = [[94,213,92,70],[250,204,21,110],[251,146,60,150],[239,68,68,190]];
    let mut rgba = vec![0u8; size * size * 4];
    for j in 0..size {
        for i in 0..size {
            let gx = if i == 0 { grid[j*w + 1] - grid[j*w] } else if i + 1 == w { grid[j*w + i] - grid[j*w + i - 1] } else { (grid[j*w + i + 1] - grid[j*w + i - 1]) * 0.5 };
            let gy = if j == 0 { grid[1*w + i] - grid[i] } else if j + 1 == h { grid[j*w + i] - grid[(j-1)*w + i] } else { (grid[(j+1)*w + i] - grid[(j-1)*w + i]) * 0.5 };
            let slope = rad2deg(((gx/step_x).hypot(gy/step_y)).atan());
            let mut cls = 0usize;
            while cls < breaks.len() && slope >= breaks[cls] { cls += 1; }
            let base = (j * size + i) * 4;
            if cls >= 1 {
                let c = colors[cls-1];
                rgba[base] = c[0]; rgba[base+1] = c[1]; rgba[base+2] = c[2]; rgba[base+3] = c[3];
            }
        }
    }
    Ok(rgba)
}

#[derive(Clone)]
struct NodeEntry { f: f64, node: (i32,i32) }
impl PartialEq for NodeEntry { fn eq(&self, other: &Self) -> bool { self.f == other.f && self.node == other.node } }
impl Eq for NodeEntry {}
impl PartialOrd for NodeEntry { fn partial_cmp(&self, other: &Self) -> Option<Ordering> { Some(self.cmp(other)) } }
impl Ord for NodeEntry { fn cmp(&self, other: &Self) -> Ordering { other.f.partial_cmp(&self.f).unwrap_or(Ordering::Equal).then_with(|| self.node.cmp(&other.node)) } }

#[pyfunction]
fn astar(path: &str, lon1: f64, lat1: f64, lon2: f64, lat2: f64, max_slope_deg: f64) -> PyResult<Option<Vec<(f64,f64,Option<f64>)>>> {
    let dem = get_dem(path)?;
    let pad = 0.4;
    let lon_min = lon1.min(lon2) - pad;
    let lon_max = lon1.max(lon2) + pad;
    let lat_min = lat1.min(lat2) - pad;
    let lat_max = lat1.max(lat2) + pad;
    let span = (lon_max - lon_min).max(lat_max - lat_min);
    let step = (span / 100.0).max(360.0 / dem.width as f64);
    let nx = ((lon_max - lon_min) / step).ceil() as i32 + 1;
    let ny = ((lat_max - lat_min) / step).ceil() as i32 + 1;
    if nx <= 0 || ny <= 0 { return Ok(None); }

    let coord = |ix: i32, iy: i32| -> (f64,f64) { (lon_min + ix as f64 * step, lat_min + iy as f64 * step) };
    let index = |lon: f64, lat: f64| -> (i32,i32) {
        let ix = (((lon - lon_min) / step).round() as i32).clamp(0, nx - 1);
        let iy = (((lat - lat_min) / step).round() as i32).clamp(0, ny - 1);
        (ix, iy)
    };

    let start_index = index(lon1, lat1);
    let goal_index = index(lon2, lat2);
    let mut elevations: HashMap<(i32,i32), Option<f64>> = HashMap::new();
    let mut elevation_at = |node: (i32,i32), dem: &Dem, elevations: &mut HashMap<(i32,i32), Option<f64>>| -> Option<f64> {
        if let Some(v) = elevations.get(&node) { return *v; }
        let (lon, lat) = coord(node.0, node.1);
        let v = sample_elevation(dem, lon, lat);
        elevations.insert(node, v);
        v
    };

    let heuristic = |node: (i32,i32)| -> f64 {
        let (lon, lat) = coord(node.0, node.1);
        great_circle_km(lon, lat, lon2, lat2)
    };

    let neighbors = [(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(-1,1),(1,-1),(1,1)];
    let mut start_cost: HashMap<(i32,i32), f64> = HashMap::new();
    let mut came_from: HashMap<(i32,i32), (i32,i32)> = HashMap::new();
    let mut queue = BinaryHeap::new();
    start_cost.insert(start_index, 0.0);
    queue.push(NodeEntry { f: heuristic(start_index), node: start_index });
    let mut expanded: usize = 0;

    while let Some(NodeEntry { node: current, .. }) = queue.pop() {
        if expanded >= 50_000 { break; }
        if current == goal_index {
            let mut path_nodes = vec![current];
            let mut cur = current;
            while let Some(prev) = came_from.get(&cur).copied() {
                path_nodes.push(prev);
                cur = prev;
            }
            path_nodes.reverse();
            let mut out = Vec::with_capacity(path_nodes.len());
            for node in path_nodes {
                let (lon, lat) = coord(node.0, node.1);
                let elev = elevation_at(node, dem, &mut elevations);
                out.push(( (lon * 100000.0).round()/100000.0, (lat * 100000.0).round()/100000.0, elev.map(|e| (e*10.0).round()/10.0) ));
            }
            return Ok(Some(out));
        }
        expanded += 1;
        let current_elev = elevation_at(current, dem, &mut elevations);
        let Some(ce) = current_elev else { continue; };
        let (current_lon, current_lat) = coord(current.0, current.1);
        let g_current = *start_cost.get(&current).unwrap_or(&f64::INFINITY);
        for (dx, dy) in neighbors {
            let neighbor = (current.0 + dx, current.1 + dy);
            if neighbor.0 < 0 || neighbor.0 >= nx || neighbor.1 < 0 || neighbor.1 >= ny { continue; }
            let Some(ne) = elevation_at(neighbor, dem, &mut elevations) else { continue; };
            let (neighbor_lon, neighbor_lat) = coord(neighbor.0, neighbor.1);
            let segment_km = great_circle_km(current_lon, current_lat, neighbor_lon, neighbor_lat);
            if segment_km <= 0.0 { continue; }
            let grade = rad2deg(((ne - ce) / (segment_km * 1000.0)).atan()).abs();
            if grade > max_slope_deg { continue; }
            let cost = segment_km * (1.0 + 2.0 * (grade / max_slope_deg));
            let tentative = g_current + cost;
            if tentative < *start_cost.get(&neighbor).unwrap_or(&f64::INFINITY) {
                came_from.insert(neighbor, current);
                start_cost.insert(neighbor, tentative);
                queue.push(NodeEntry { f: tentative + heuristic(neighbor), node: neighbor });
            }
        }
    }
    Ok(None)
}

#[pymodule]
fn astra_dem_rs(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(elevation_m, m)?)?;
    m.add_function(wrap_pyfunction!(heightmap, m)?)?;
    m.add_function(wrap_pyfunction!(slope_rgba, m)?)?;
    m.add_function(wrap_pyfunction!(astar, m)?)?;
    Ok(())
}
