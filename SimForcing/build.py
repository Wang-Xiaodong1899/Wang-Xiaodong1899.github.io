#!/usr/bin/env python3
"""Build a self-contained SimForcing website from the two selected-case manifests."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[1]
DATASETS = {'bridge': 'Bridge', 'omniobject3d': 'OmniObject3D'}
TRACKS = [('simulation', 'SimForcing · Simulation'), ('real', 'SimForcing · Real'),
          ('gt', 'Real ground truth'), ('geni', 'GeniWorld'), ('base', 'Baseline'), ('ener', 'EnerVerse-AC')]

def probe(path):
    return json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,nb_frames,r_frame_rate,duration,codec_name,pix_fmt',
        '-of', 'json', str(path)]))['streams'][0]

def run(args):
    subprocess.run(['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-threads', '1', *args], check=True)

def prepare_case(dataset, case, base, force):
    case_id = case['eval_index']
    target = ROOT / 'media' / dataset / f'{case_id:06d}'
    target.mkdir(parents=True, exist_ok=True)
    videos = {}
    provenance = {}
    for key, label in TRACKS:
        method_key = 'ours' if key in ('simulation', 'real', 'gt') else key
        method = case['methods'][method_key]
        output = target / f'{key}.mp4'
        if key == 'simulation':
            original = (base / method['original_mp4']).resolve()
            source_info = probe(original)
            start = 1 if dataset == 'omniobject3d' else 0
            count = method['frames']
            if (source_info['width'], source_info['height']) != (320, 896):
                raise ValueError(f'Unexpected Ours composite layout: {original}')
            if int(source_info['nb_frames']) != count + start:
                raise ValueError(f'Unexpected simulation frame count: {original}')
            if force or not output.exists() or output.stat().st_mtime < original.stat().st_mtime:
                temp = output.with_suffix('.tmp.mp4')
                try:
                    run(['-i', str(original), '-map', '0:v:0', '-an', '-vf',
                         f'trim=start_frame={start}:end_frame={start+count},setpts=PTS-STARTPTS,crop=320:224:0:0,setsar=1',
                         '-r', method['fps'], '-fps_mode', 'cfr', '-c:v', 'libx264', '-threads', '1',
                         '-crf', '18', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(temp)])
                    temp.replace(output)
                finally:
                    temp.unlink(missing_ok=True)
            provenance[key] = {'source': str(original.relative_to(REPO)), 'crop_xywh': [0, 0, 320, 224],
                               'source_frame_indices': list(range(start, start+count))}
        else:
            original = (base / method['gt_mp4' if key == 'gt' else 'prediction_mp4']).resolve()
            if force or not output.exists() or output.stat().st_mtime < original.stat().st_mtime:
                shutil.copy2(original, output)
            provenance[key] = {'source': str(original.relative_to(REPO)),
                               'evaluation_source': method['source'],
                               'source_frame_indices': method.get('source_frame_indices')}
        info = probe(output)
        fps_num, fps_den = (int(x) for x in method['fps'].split('/'))
        expected_duration = method['frames'] / (fps_num / fps_den)
        if ((info['width'], info['height']) != (320, 224)
                or int(info['nb_frames']) != method['frames']
                or info['r_frame_rate'] != method['fps']
                or abs(float(info['duration'])-expected_duration) > .001
                or info['codec_name'] != 'h264' or info['pix_fmt'] != 'yuv420p'):
            raise ValueError(f'Invalid video: {output}: {info}')
        poster = output.with_suffix('.jpg')
        if force or not poster.exists() or poster.stat().st_mtime < output.stat().st_mtime:
            run(['-i', str(output), '-frames:v', '1', '-q:v', '3', str(poster)])
        videos[key] = {'label': label, 'src': output.relative_to(ROOT).as_posix(),
                       'poster': poster.relative_to(ROOT).as_posix(), 'width': 320, 'height': 224,
                       'frames': int(info['nb_frames']), 'fps': info['r_frame_rate'], 'duration': float(info['duration'])}
    return {'id': case_id, 'dataset': dataset, 'episode': case['episode'], 'instruction': case['instruction'],
            'cycle_duration': 4.0 if dataset == 'omniobject3d' else 2.625, 'videos': videos}, provenance

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workers', type=int, default=4)
    parser.add_argument('--force', action='store_true')
    args = parser.parse_args()
    selections, pending = {}, []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for dataset in DATASETS:
            source = REPO / 'visualizations' / f'{dataset}_demo_picks.json'
            data = json.loads(source.read_text())
            lookup = {case['eval_index']: case for case in data['cases']}
            ids = data['eval_indices']
            if len(ids) != len(set(ids)) or set(ids) != set(lookup):
                raise ValueError(f'Selection IDs do not match case records: {source}')
            selections[dataset] = ids
            for case_id in ids:
                pending.append(pool.submit(prepare_case, dataset, lookup[case_id], REPO/data['video_base'], args.force))
        records, sources = {}, {}
        for index, future in enumerate(as_completed(pending), 1):
            case, provenance = future.result()
            key = (case['dataset'], case['id'])
            records[key] = case
            sources[f'{key[0]}/{key[1]:06d}'] = provenance
            print(f'Prepared {index}/{len(pending)}: {key[0]} / {key[1]:06d} (6 verified MP4s)', flush=True)
    data = {'project': 'SimForcing', 'datasets': [{'id': key, 'name': name,
        'cases': [records[(key, case_id)] for case_id in selections[key]]} for key, name in DATASETS.items()]}
    (ROOT/'data.json').write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n')
    (ROOT/'data.js').write_text('window.SIMFORCING_DATA = '+json.dumps(data, ensure_ascii=False)+';\n')
    (ROOT/'provenance.json').write_text(json.dumps({'selected_indices': selections, 'media': sources,
        'method_sources': ['SimForcing-Proj/sections/0_abstract.tex', 'SimForcing-Proj/sections/3_method.tex'],
        'simulation_layout_verified_in': ['scripts/infer_v12_delta_core_cond_aux_bridge_from_sim_latent_sim_as_real.py',
                                         'scripts/infer_v12_delta_core_cond_aux_omniobject3d_from_sim_latent.py']}, indent=2)+'\n')
    (ROOT/'assets').mkdir(exist_ok=True)
    shutil.copy2(REPO/'SimForcing-Proj/SimForcing/assets/method.png', ROOT/'assets/method.png')
    shutil.copy2(REPO/'SimForcing-Proj/resources/logos/pku-seal.png', ROOT/'assets/pku-seal.png')
    print(f'Done: {len(records)} selected cases, {len(records)*6} MP4s and posters.', flush=True)

if __name__ == '__main__':
    main()
