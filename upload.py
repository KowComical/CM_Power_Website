import subprocess
import pandas as pd
import os
import ast
import math
import json
from datetime import datetime
import shutil
from pathlib import Path
from html import escape
from urllib.parse import urlparse

global_path = '/data/xuanrenSong/CM_Power_Website'
file_path = os.path.join(global_path, 'data')
tools_path = os.path.join(global_path, 'tools')
data_description_path = os.path.join(tools_path, 'data_description')
line_path = os.path.join(tools_path, 'line_chart')
stacked_area_path = os.path.join(tools_path, 'stacked_area_chart')


categories = {
    'Fossil': ['coal', 'gas', 'oil'],
    'Nuclear': ['nuclear'],
    'Renewables': ['solar', 'wind', 'other', 'hydro']
}

sub_category = ['total', 'coal', 'gas', 'oil', 'nuclear', 'hydro', 'wind', 'solar', 'other', 'fossil', 'renewables']
NON_COUNTRY_AGGREGATES = {'EU27&UK'}

GENERATED_OUTPUTS = [
    '.nojekyll',
    'index.html',
    'data/data_description.csv',
    'data/data_for_download.csv.gz',
    'data/data_for_scatter_plot.csv',
    'data/iea_compare_metadata.json',
    'static_site',
    'tools/data_description',
    'tools/line_chart',
    'tools/stacked_area_chart',
    'tools/logo_edited.png',
    'tools/style.css',
]

REMOVED_OUTPUTS = [
    'data/data_for_download.csv',
]

PAGES_BRANCH = 'gh-pages'
PAGES_WORKTREE = Path('/tmp/cm_power_website_gh_pages_auto')

COLORS = {
    "coal": "#A3A090",
    "oil": "#D4A58F",
    "gas": "#B6A1D4",
    "hydro": "#89C5C8",
    "nuclear": "#E8ACBF",
    "other": "#AED3DE",
    "solar": "#FDDCA3",
    "wind": "#98D4A1"
}

CONTINENT_COLORS = {
    'Asia': '#FFE5B4',
    'Africa': '#FF9898',
    'Europe': '#B0C4DE',
    'North America': '#BA9192',
    'South America': '#D8BFD8',
    'Oceania': '#CBE2DA',
}


def main():
    # 先更新数据
    process_data()
    # 上传
    git_push(global_path)


def process_data():
    df = pd.read_csv('/data/xuanrenSong/CM_Power_Database/data/global/Global_PM_corT.csv')

    df['date'] = pd.to_datetime(df['date'], format='%d/%m/%Y')
    df = pd.pivot_table(df, index=['country', 'date'], values='value', columns='sector').reset_index()
    df.columns = ['country', 'date', 'coal', 'gas', 'hydro', 'nuclear', 'oil', 'other', 'solar', 'wind']
    df['total'] = df.sum(axis=1, numeric_only=True)
    df = df[df['total'] != 0].reset_index(drop=True)
    df['fossil'] = df[['coal', 'gas', 'oil']].sum(axis=1)
    df['renewables'] = df[['hydro', 'other', 'solar', 'wind']].sum(axis=1)

    df['country'] = df['country'].replace({
        'EU27 & UK': 'EU27&UK',
        'UK': 'United Kingdom',
        'US': 'United States',
    })
    # 上游原始数据里偶尔会把表头/汇总块读成 country=Generation，这不是国家，前端不应展示。
    df = df[df['country'] != 'Generation'].reset_index(drop=True)

    df['year'] = df['date'].dt.year
    df = df.set_index(['date', 'country', 'year']).stack().reset_index().rename(columns={'level_3': 'type', 0: 'value'})

    # 生成7日平滑数据
    df_7mean = df.copy()
    df_7mean['value'] = df_7mean.groupby(['country', 'type'])['value'].transform(
        lambda x: x.rolling(window=7, min_periods=1).mean())

    # 四舍五入到2位小数
    df_7mean['value'] = round(df_7mean['value'], 2)

    # 输出阶段
    # 先输出一版给首页data description 用的
    df.to_csv(
        os.path.join(file_path, 'data_for_download.csv.gz'),
        index=False,
        encoding='utf_8_sig',
        compression='gzip',
    )
    process_data_description(df)

    # 再输出一版给line图用的
    process_line_data(df_7mean)

    # 再输出一版给stacked area用的
    process_stacked_area_data(df_7mean)

    # 再计算一版散点图用的
    df_daily = df.copy()
    df = load_power_data(df)
    df_iea = load_iea_data()
    df_filtered = prepare_comparison_data(df, df_iea)

    df_filtered.to_csv(os.path.join(file_path, 'data_for_scatter_plot.csv'), index=False, encoding='utf_8_sig')
    write_iea_compare_metadata(df_daily, df_iea, df_filtered)


def process_data_description(dataframe):
    for selected_energy in sub_category:
        df = dataframe[dataframe['type'] == selected_energy].reset_index(drop=True)

        df['value'] = df['value'] / 1000  # Gwh to Twh
        df['date'] = pd.to_datetime(df['date'])

        ytd_sum_res = df.groupby('country').apply(current_year_sum)
        lytd_sum_res = df.groupby('country').apply(last_year_ytd_sum)
        safe_lytd = lytd_sum_res.where(lytd_sum_res != 0)
        percentage_change_res = ((ytd_sum_res - safe_lytd) / safe_lytd) * 100

        results = [{'country': country,
                    'max_date': max(df[df['country'] == country]['date']),
                    'total_value': sum(df[df['country'] == country]['value']),
                    'row_count': len(df[df['country'] == country])}
                   for country in df['country'].unique()]

        df = pd.DataFrame(results)
        df['year_to_date_sum'] = df['country'].map(ytd_sum_res)
        df['percentage_change'] = df['country'].map(percentage_change_res)
        df['test_country'] = df['country']
        df['type'] = selected_energy

        # 读取国家信息
        data_description = pd.read_csv('/data/xuanrenSong/CM_Power_Website/data/data_description.csv')

        data_description['starting_date'] = pd.to_datetime(data_description['starting_date']).dt.strftime('%Y-%b')

        df = pd.merge(df, data_description)

        # 筛选大洲
        continent_list = ['Africa', 'Asia', 'Europe', 'North America', 'Oceania', 'South America', 'World']
        for continent in continent_list:
            if continent != 'World':
                df_continent = df[df['continent'] == continent]
            else:
                df_continent = df.copy()

            # 按照值的大小排序
            df_continent = df_continent.sort_values(by='year_to_date_sum', ascending=False).reset_index(drop=True)

            view_details_list = ["", """style="display: none;" """]

            for view_details in view_details_list:
                html_content = get_scorecard(df_continent, view_details)

                if view_details == "":
                    view_details_name = 'none'
                else:
                    view_details_name = 'visible'

                html_name = os.path.join(
                    data_description_path, f'{selected_energy}_{continent}_{view_details_name}.html')
                # Write the HTML content to a file
                with open(html_name, 'w', encoding='utf-8') as f:
                    f.write(html_content)


def build_day_axis_labels():
    # 使用闰年作为模板，让 Feb-29 保持在正确位置；非闰年数据会在该点留空。
    dates = pd.date_range("2020-01-01", "2020-12-31", freq="D")
    return dates.strftime("%b-%d").tolist()


def nice_axis_bounds(values, split_count=4):
    clean_values = pd.Series(values).dropna()
    if clean_values.empty:
        return 0, 1, 0.25

    raw_min = float(clean_values.min())
    raw_max = float(clean_values.max())
    if raw_min == raw_max:
        raw_min = max(0, raw_min * 0.9)
        raw_max = raw_max * 1.1 if raw_max else 1

    span = raw_max - raw_min
    rough_interval = span / split_count
    interval = nice_number(rough_interval)

    axis_min = math.floor(raw_min / interval) * interval
    axis_max = math.ceil(raw_max / interval) * interval

    if raw_min >= 0 and axis_min < 0:
        axis_min = 0

    return round_axis_value(axis_min), round_axis_value(axis_max), round_axis_value(interval)


def nice_number(value):
    if value <= 0 or math.isnan(value):
        return 1

    exponent = math.floor(math.log10(value))
    fraction = value / (10 ** exponent)

    if fraction <= 1:
        nice_fraction = 1
    elif fraction <= 2:
        nice_fraction = 2
    elif fraction <= 2.5:
        nice_fraction = 2.5
    elif fraction <= 5:
        nice_fraction = 5
    else:
        nice_fraction = 10

    return nice_fraction * (10 ** exponent)


def round_axis_value(value):
    if abs(value) >= 10:
        return float(round(value))
    if abs(value) >= 1:
        return float(round(value, 1))
    return float(round(value, 3))


def process_line_data(dataframe):
    # 横轴固定为完整自然年顺序，避免闰年的 Feb-29 被排到年底。
    formatted_dates = build_day_axis_labels()
    country_description = pd.read_csv(os.path.join(file_path, 'data_description.csv'))
    country_continent = dict(zip(country_description['country'], country_description['continent']))

    for category_name in sub_category:
        type_sum = dataframe[dataframe['type'] == category_name].groupby('country')['value'].sum()
        sorted_countries = type_sum.sort_values(ascending=False).index.tolist()

        num_countries = len(sorted_countries)
        COLS = 4
        ROWS = int(math.ceil(num_countries / COLS))
        WIDTH = 100 / COLS
        HEIGHT = 92 / ROWS

        ROWS_PER_GRID = math.ceil(len(sorted_countries) / COLS)
        PLOT_HEIGHT = 275
        WIDTH_ADJUSTMENT = 0.8
        HEIGHT_ADJUSTMENT = 0.35

        option = {
            "title": [{
                "text": "Global Power Generation Trends by Source for Key Countries (TWh)",
                "left": "center",
                "top": "0%"
            }],
            "tooltip": {
                "trigger": "axis"
            },
            "xAxis": [],
            "yAxis": [],
            "grid": [],
            "series": [],
            "graphic": [],
        }

        unique_years_all = sorted(dataframe['year'].unique())
        default_years = unique_years_all[-4:]
        colors_for_years = dict(zip(unique_years_all, get_line_colors(unique_years_all)))

        for idx, country in enumerate(sorted_countries):
            row_idx = idx // COLS
            col_idx = idx % COLS

            option["grid"].append({
                "top": f"{HEIGHT * row_idx + HEIGHT_ADJUSTMENT + 3.0}%",
                "left": f"{WIDTH * col_idx + WIDTH_ADJUSTMENT - 0.2}%",
                "width": f"{WIDTH - 2.0 * WIDTH_ADJUSTMENT}%",
                "height": f"{HEIGHT - 4.2 * HEIGHT_ADJUSTMENT}%",
                "containLabel": True,
                "show": True,
                "backgroundColor": "rgba(255, 255, 255, 0)",
                "borderColor": "rgba(49, 90, 125, 0.18)",
                "borderWidth": 1,
            })

            grid_center = WIDTH * col_idx + WIDTH_ADJUSTMENT - 0.2 + (WIDTH - 2.0 * WIDTH_ADJUSTMENT) / 2
            option["graphic"].append({
                "type": "text",
                "left": f"{grid_center}%",
                "top": f"{HEIGHT * row_idx + HEIGHT_ADJUSTMENT + 2.0}%",
                "z": 100,
                "style": {
                    "text": country,
                    "fontSize": 14,
                    "fontWeight": "bold",
                    "align": "center",
                    "textAlign": "center",
                    "fill": "#333333",
                }
            })

            country_data = dataframe[dataframe['country'] == country]
            country_type_data = country_data[country_data['type'] == category_name]
            min_val, max_val, interval = nice_axis_bounds(country_type_data['value'])

            option["xAxis"].append({
                "gridIndex": idx,
                "type": "category",
                "data": formatted_dates,
                "axisTick": {
                    "alignWithLabel": True,
                    "interval": 91
                },
                "axisLabel": {
                    "interval": 91,
                    "fontSize": 10,
                    "hideOverlap": True,
                    "margin": 8,
                },
                "axisLine": {
                    "lineStyle": {
                        "color": "#A8B3BA"
                    }
                },
            })

            option["yAxis"].append({
                "gridIndex": idx,
                "type": "value",
                "min": min_val,
                "max": max_val,
                "interval": interval,
                "splitNumber": 4,
                "axisLabel": {
                    "fontSize": 10,
                },
                "splitLine": {
                    "lineStyle": {
                        "color": "#E5EAED"
                    }
                },
                "axisLine": {
                    "lineStyle": {
                        "color": "#A8B3BA"
                    }
                }
            })

            unique_years = sorted(country_data['year'].unique())
            for year in unique_years:
                year_data = country_type_data[country_type_data['year'] == year].copy()
                year_data['day_label'] = year_data['date'].dt.strftime('%b-%d')
                values_by_day = dict(zip(year_data['day_label'], year_data['value']))
                is_default_year = year in default_years

                option["series"].append({
                    "name": str(year),
                    "type": "line",
                    "xAxisIndex": idx,
                    "yAxisIndex": idx,
                    "data": [values_by_day.get(day_label) for day_label in formatted_dates],
                    "showSymbol": False,
                    "connectNulls": False,
                    "lineStyle": {
                        "width": 2.2 if is_default_year else 1.4,
                        "color": colors_for_years[year],
                        "opacity": 1 if is_default_year else 0.45,
                    },
                    "itemStyle": {
                        "color": colors_for_years[year],
                        "opacity": 1 if is_default_year else 0.45,
                    },
                    "emphasis": {
                        "lineStyle": {
                            "width": 4
                        },
                        "itemStyle": {
                            "opacity": 1
                        }
                    },
                    "selectedMode": "single",
                })

        option["legend"] = {
            "data": [{"name": str(year), "icon": "circle", "textStyle": {"color": colors_for_years[year]}} for year in
                     unique_years_all],
            "selected": {str(year): year in default_years for year in unique_years_all},
            "left": 'center',
            "orient": "horizontal",
            "top": 50,
            "icon": "circle",
            "itemWidth": 12,
            "itemHeight": 12,
            "borderColor": "#333",
            "borderWidth": 1,
            "borderRadius": 4,
            "padding": 10,
            "backgroundColor": "#f4f4f4",
            "textStyle": {
                "fontSize": 16,
                "color": "#333"
            }
        }

        with open(os.path.join(line_path, f'{category_name}.json'), 'w') as config_file:
            json.dump({
                "option": option,
                "ROWS_PER_GRID": ROWS_PER_GRID,
                "PLOT_HEIGHT": PLOT_HEIGHT,
                "country_count": len(sorted_countries),
                "countries": [
                    {
                        "name": country,
                        "continent": country_continent.get(country, "Other"),
                    }
                    for country in sorted_countries
                ],
                "years": [str(year) for year in unique_years_all],
                "default_years": [str(year) for year in default_years],
                "year_colors": {str(year): colors_for_years[year] for year in unique_years_all},
            }, config_file)


def process_stacked_area_data(dataframe):
    dataframe = dataframe[~dataframe['type'].isin(['fossil', 'renewables', 'total'])].reset_index(drop=True)
    dataframe['total'] = dataframe.groupby(['country', 'date'])['value'].transform('sum')
    dataframe['percentage'] = round((dataframe['value'] / dataframe['total']) * 100, 2)

    df_7mean = dataframe[['date', 'country', 'year', 'type', 'percentage']]

    # 根据最后一年选择的能源类型占比来分类 - 平均值
    df_sort = df_7mean.copy()
    last_year = max(df_sort['year'])
    df_sort['category'] = df_sort['type'].apply(map_to_category)
    # Group by the new 'category' column to get the sum of percentages for each category
    df_sort = df_sort.groupby(['date', 'country', 'year', 'category'])['percentage'].sum().reset_index()

    filtered_df = df_sort[(df_sort['year'] == last_year)].drop(columns=['year'])

    filtered_df = filtered_df.groupby(['country', 'category']).mean(numeric_only=True).reset_index()
    filtered_df['percentage'] = round(filtered_df['percentage'], 2)

    # 再输出画图要用的json
    for selected_category, _ in categories.items():

        temp_df = filtered_df[filtered_df['category'] == selected_category]
        # Sort the countries by the average percentage in descending order
        sorted_countries = temp_df.sort_values(by='percentage', ascending=False)['country'].tolist()

        # Store the summed percentages in a dictionary for easier retrieval
        percentage_dict = dict(temp_df[['country', 'percentage']].values)

        energy_types = ['coal', 'gas', 'oil', 'nuclear', 'hydro', 'wind', 'solar', 'other']

        COLS = 4
        ROWS = int(math.ceil(len(sorted_countries) / COLS))
        WIDTH = 100 / COLS
        HEIGHT = 92 / ROWS

        ROWS_PER_GRID = math.ceil(len(sorted_countries) / COLS)
        PLOT_HEIGHT = 275  # 根据需要进行调整

        WIDTH_ADJUSTMENT = 0.8
        HEIGHT_ADJUSTMENT = 0.3

        option = {
            "title": [{
                "text": "Power Generation Distribution by Source for Key Countries (%)",
                "left": "center",
                "top": "0%"
            }],
            "tooltip": {
                "trigger": "axis"
            },
            "legend": {
                "data": energy_types,
                "orient": "horizontal",
                "left": 'center',
                "top": 50,
                "icon": "circle",  # This will give a filled circle symbol
                "itemWidth": 12,  # Controls the width of the circle
                "itemHeight": 12,  # Controls the height of the circle
                "borderColor": "#333",  # Border color, here it's a dark gray
                "borderWidth": 1,  # Width of the border
                "borderRadius": 4,  # Rounded corners, adjust for desired roundness
                "padding": 10,  # Padding around the legend items
                "backgroundColor": "#f4f4f4",  # Light gray background for the legend
                "textStyle": {
                    "fontSize": 16,
                    "color": "#333"  # Font color matching the border color
                }
            },
            "xAxis": [],
            "yAxis": [],
            "grid": [],
            "series": [],
            "graphic": [],
        }

        # Grid, xAxis, and yAxis configurations remain the same
        for idx, country in enumerate(sorted_countries):
            country_data = df_7mean[df_7mean['country'] == country].reset_index(drop=True)
            country_dates = country_data['date'].dt.strftime('%Y-%m-%d').drop_duplicates().tolist()

            ratio_sum = percentage_dict.get(country, 0)
            ratio_sum_str = f"{ratio_sum:.2f}%"

            option["graphic"].append({
                "type": "text",
                "left": f"{WIDTH * (idx % COLS) + WIDTH_ADJUSTMENT + WIDTH / 2 - 6}%",  # Centered horizontally
                "top": f"{HEIGHT * (idx // COLS) + HEIGHT_ADJUSTMENT + 2}%",  # + 8
                "z": 100,  # Place it above other elements
                "style": {
                    "text": f"{country} - {selected_category} {ratio_sum_str}",
                    "fontSize": 14,
                    "fontWeight": "bold",
                    "textAlign": "center"  # Center align text
                }
            })

            option["grid"].append({
                "top": f"{HEIGHT * (idx // COLS) + HEIGHT_ADJUSTMENT + 2.5}%",
                "left": f"{WIDTH * (idx % COLS) + WIDTH_ADJUSTMENT - 0.2}%",
                "width": f"{WIDTH - 2.0 * WIDTH_ADJUSTMENT}%",
                "height": f"{HEIGHT - 4.0 * HEIGHT_ADJUSTMENT}%",
                "containLabel": True
            })

            option["xAxis"].append({
                "gridIndex": idx,
                "type": "category",
                "data": country_dates
            })

            option["yAxis"].append({
                "gridIndex": idx,
                "type": "value",
                "min": 0,
                "max": 100,
                # "name": f"{country} - {selected_category} {ratio_sum_str}",
                "nameTextStyle": {
                    "fontSize": 14,
                    "fontWeight": "bold",
                    "padding": [0, 0, 0, 100]
                }
            })

        # New nested structure for series creation
        for energy_type in energy_types:
            for idx, country in enumerate(sorted_countries):
                country_data = df_7mean[df_7mean['country'] == country].reset_index(drop=True)
                series_data = country_data[country_data['type'] == energy_type]['percentage'].tolist()

                if len(series_data) == len(option["xAxis"][idx]["data"]):  # Ensure data alignment
                    option["series"].append({
                        "name": energy_type,
                        "type": "line",
                        "stack": country,  # Unique stack label based on country name
                        "areaStyle": {"color": COLORS.get(energy_type)},
                        "itemStyle": {"color": COLORS.get(energy_type)},
                        "xAxisIndex": idx,
                        "yAxisIndex": idx,
                        "data": series_data
                    })

        # 输出json
        # Save the configuration as a JSON file with the subcategory name
        with open(os.path.join(stacked_area_path, f'{selected_category}.json'), 'w') as config_file:
            json.dump({
                "option": option,
                "ROWS_PER_GRID": ROWS_PER_GRID,
                "PLOT_HEIGHT": PLOT_HEIGHT
            }, config_file)


def load_power_data(df):
    df['date'] = pd.to_datetime(df['date'])
    df['month'] = df['date'].dt.month
    return df.drop(columns=['date']).groupby(['year', 'month', 'country', 'type']).sum().reset_index()


def load_iea_data():
    df_iea = pd.read_csv('/data/xuanrenSong/CM_Power_Database/data/other_database/iea/iea_cleaned.csv')
    country_replacements = {
        'Republic of Turkiye': 'Turkey',
        'Slovak Republic': 'Slovakia',
        "People's Republic of China": 'China'
    }
    df_iea['country'] = df_iea['country'].replace(country_replacements)

    with open(os.path.join(tools_path, 'eu_countries.txt'), 'r') as file:
        eu_countries = ast.literal_eval(file.read())

    df_iea_eu = df_iea[df_iea['country'].isin(eu_countries)].reset_index(drop=True)
    df_iea_eu['country'] = 'EU27&UK'
    df_iea_eu = df_iea_eu.groupby(['country', 'year', 'month']).sum().reset_index()

    df_iea = pd.concat([df_iea, df_iea_eu]).reset_index(drop=True)

    df_iea['total'] = df_iea[['coal', 'gas', 'oil', 'nuclear', 'hydro', 'solar', 'wind', 'other']].sum(axis=1)
    df_iea['fossil'] = df_iea[['coal', 'gas', 'oil']].sum(axis=1)
    df_iea['renewables'] = df_iea[['hydro', 'solar', 'wind', 'other']].sum(axis=1)

    return df_iea.melt(id_vars=['country', 'year', 'month'], var_name='type', value_name='iea')


def prepare_comparison_data(df, df_iea):
    df_compare = pd.merge(df, df_iea)
    df_compare['value'] = round(df_compare['value'] / 1000, 2)
    df_compare['iea'] = round(df_compare['iea'] / 1000, 2)
    return df_compare


def latest_month_label(dataframe):
    if dataframe.empty:
        return ""
    latest = dataframe[['year', 'month']].drop_duplicates().sort_values(['year', 'month']).iloc[-1]
    return f"{int(latest['year']):04d}-{int(latest['month']):02d}"


def write_iea_compare_metadata(df_power_daily, df_iea, df_compare):
    metadata = {
        'cm_power_latest_date': pd.to_datetime(df_power_daily['date']).max().strftime('%Y-%m-%d'),
        'iea_latest_month': latest_month_label(df_iea),
        'comparison_latest_month': latest_month_label(df_compare),
        'unit': 'TWh'
    }

    with open(os.path.join(file_path, 'iea_compare_metadata.json'), 'w', encoding='utf-8') as file:
        json.dump(metadata, file, ensure_ascii=False, indent=2)


def run_git(repo_path, args):
    result = subprocess.run(
        ['git', '-C', repo_path, *args],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        message = result.stderr.strip() or result.stdout.strip()
        raise RuntimeError(f"git {' '.join(args)} failed: {message}")
    return result.stdout.strip()


def git_has_staged_changes(repo_path):
    result = subprocess.run(
        ['git', '-C', repo_path, 'diff', '--cached', '--quiet'],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )
    if result.returncode not in (0, 1):
        message = result.stderr.strip()
        raise RuntimeError(f"git diff --cached --quiet failed: {message}")
    return result.returncode == 1


def git_tracks_path(repo_path, relative_path):
    result = subprocess.run(
        ['git', '-C', repo_path, 'ls-files', '--error-unmatch', relative_path],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    return result.returncode == 0


def git_add_generated_outputs(repo_path):
    paths_to_add = [
        relative_path
        for relative_path in GENERATED_OUTPUTS + REMOVED_OUTPUTS
        if (Path(repo_path) / relative_path).exists() or git_tracks_path(repo_path, relative_path)
    ]

    if paths_to_add:
        run_git(repo_path, ['add', '-A', *paths_to_add])


def remove_path(path):
    if path.is_dir() and not path.is_symlink():
        shutil.rmtree(path)
    elif path.exists():
        path.unlink()


def copy_generated_output(repo_path, pages_path, relative_path):
    source = Path(repo_path) / relative_path
    target = Path(pages_path) / relative_path

    remove_path(target)

    if not source.exists():
        return

    target.parent.mkdir(parents=True, exist_ok=True)
    if source.is_dir():
        shutil.copytree(
            source,
            target,
            ignore=shutil.ignore_patterns('__pycache__', '.ipynb_checkpoints'),
        )
    else:
        shutil.copy2(source, target)


def deploy_to_github_pages(repo_path, commit_message):
    pages_path = PAGES_WORKTREE

    # 使用独立的临时 worktree 发布 gh-pages，避免把自动部署过程混进主工作区。
    remove_path(pages_path)
    run_git(repo_path, ['worktree', 'prune'])
    run_git(repo_path, ['fetch', 'origin', PAGES_BRANCH])
    run_git(repo_path, ['worktree', 'add', '--detach', str(pages_path), f'origin/{PAGES_BRANCH}'])

    for relative_path in REMOVED_OUTPUTS:
        remove_path(pages_path / relative_path)

    for relative_path in GENERATED_OUTPUTS:
        copy_generated_output(repo_path, pages_path, relative_path)

    run_git(str(pages_path), ['add', '-A'])
    if not git_has_staged_changes(str(pages_path)):
        print("No GitHub Pages changes to deploy.")
        return

    run_git(str(pages_path), ['commit', '-m', commit_message])
    run_git(str(pages_path), ['push', 'origin', f'HEAD:{PAGES_BRANCH}'])
    print(f"GitHub Pages deployed to {PAGES_BRANCH}.")


def git_push(repo_path, commit_message=None):
    commit_message = commit_message or f"Update website data {datetime.now():%Y-%m-%d}"

    # 只允许快进更新，避免自动任务在冲突时生成合并提交。
    run_git(repo_path, ['pull', '--ff-only'])

    # 只提交网站需要的生成产物，避免日志、缓存、wandb 等脏文件进入仓库。
    git_add_generated_outputs(repo_path)

    if git_has_staged_changes(repo_path):
        run_git(repo_path, ['commit', '-m', commit_message])
        current_branch = run_git(repo_path, ['rev-parse', '--abbrev-ref', 'HEAD'])
        run_git(repo_path, ['push', 'origin', current_branch])
        print("Website data changes pulled, committed, and pushed successfully.")
    else:
        print("No website data changes to commit.")

    deploy_to_github_pages(repo_path, commit_message)


def map_to_category(type_):
    for category, types in categories.items():
        if type_ in types:
            return category
    return None


def get_line_colors(years_list):
    sorted_years = sorted(years_list)
    latest_year = max(sorted_years)
    history_palette = [
        '#315A7D',
        '#456D8E',
        '#5B82A0',
        '#7197B2',
        '#87ABC2',
        '#9CBED0',
        '#B0CEDC',
    ]
    colors = []

    for year in years_list:
        distance_from_latest = latest_year - year
        if distance_from_latest == 0:
            colors.append('#C7352E')
        else:
            palette_index = min(distance_from_latest - 1, len(history_palette) - 1)
            colors.append(history_palette[palette_index])

    return colors


def adjust_lightness(rgb, factor):
    """
    Adjusts the lightness of an RGB color.
    Positive factor values lighten the color, while negative values darken it.
    """
    r, g, b = rgb
    r = min(max(0, r + int(r * factor)), 255)
    g = min(max(0, g + int(g * factor)), 255)
    b = min(max(0, b + int(b * factor)), 255)
    return r, g, b


def current_year_sum(group):
    latest_date_for_country = group['date'].max()
    current_year_data = group[group['date'].dt.year == latest_date_for_country.year]
    return current_year_data[current_year_data['date'] <= latest_date_for_country]['value'].sum()


def last_year_ytd_sum(group):
    # 获取组内最晚日期
    latest_date_for_country = group['date'].max()

    try:
        # 尝试将年份设置为去年，保持月份和日期不变
        lytd_end_date = latest_date_for_country.replace(year=latest_date_for_country.year - 1)
    except ValueError:
        # 如果遇到2月29日且去年不是闰年的情况，将日期调整为2月28日
        lytd_end_date = latest_date_for_country.replace(year=latest_date_for_country.year - 1, day=28)

    # 选择去年的数据
    last_year_data = group[group['date'].dt.year == lytd_end_date.year]

    # 计算去年至今的总和
    return last_year_data[last_year_data['date'] <= lytd_end_date]['value'].sum()


def get_scorecard(df, view_details):
    if df.empty:
        return """
        <div class="ui warning message">
            No data available for the selected filters.
        </div>
        """

    country_rows = df[~df['country'].isin(NON_COUNTRY_AGGREGATES)]
    n_countries = len(country_rows)
    latest_date = min(df['max_date'].dt.strftime('%Y-%b'))
    selected_energy = safe_html(df['type'].tolist()[0])

    table_scorecard = f"""
    <div class="overview-summary ui four small statistics">
        <div class="grey statistic">
            <div class="value">
                {selected_energy}
            </div>
            <div class="label">
                energy type
            </div>
        </div>
        <div class="grey statistic">
            <div class="value">
                {n_countries}
            </div>
            <div class="label">
                number of key countries
            </div>
        </div>
        <div class="grey statistic">
            <div class="value">
                {latest_date}
            </div>
            <div class="label">
                latest common date
            </div>
        </div>
        <div class="grey statistic">
            <div class="value">
                TWh
            </div>
            <div class="label">
                Unit
            </div>
        </div>
    </div>
    """

    table_scorecard += "<div id='mydiv' class='ui centered cards overview-card-grid'>"

    # <div class="content" style="background-color: {header_bg(row['type'])};">

    for index, row in df.iterrows():
        country = safe_html(row['country'])
        continent = safe_html(row['continent'])
        resolution = safe_html(row['resolution'])
        starting_date = safe_html(row['starting_date'])
        update_frequency = safe_html(row['update_frequency'])
        region_data = safe_html(row['region_data'])
        source = safe_html(row.get('source', ''))
        source_url = safe_url(row.get('source_url', ''))
        if source_url != "#":
            source_markup = f'<a href="{source_url}" target="_blank" rel="noopener noreferrer">{source}</a>'
        else:
            source_markup = source
        yoy_value = format_percentage(row['percentage_change'])
        yoy_color = color_percentage(row['percentage_change'])
        ytd_value = format_number(row['year_to_date_sum'])

        table_scorecard += f"""
            <div class="card">
                <div class="content cm-card-header" style="background-color: {header_bg(row['continent'])};">
                    <div class="header smallheader">{country}</div>
                    <div class="meta smallheader">{continent}</div>
                </div>
                <div class="content cm-kpi-grid">
                    <div class="kpi number">
                        {ytd_value}
                        <p class="kpi text">Year-to-Date (YTD)</p>
                    </div>
                    <div class="kpi number" style="color: {yoy_color};">
                        {yoy_value}
                        <p class="kpi text">YTD YoY Change</p>
                    </div>
                </div>
                <div class="extra content cm-card-meta">
                    <div class="meta"><i class="calendar alternate outline icon"></i> Updated to: {row['max_date'].strftime("%Y-%m-%d")}</div>
                    <div class="meta"><i class="edit icon"></i> Data Since: {starting_date}</div>
                    <div class="meta"><i class="external alternate icon"></i> Source: {source_markup}</div>
                </div>
                <div class="extra content cm-card-meta" {view_details}> 
                    <div class="meta"><i class="history icon"></i> Time Resolution: {resolution}</div>
                    <div class="meta"><i class="calendar times outline icon"></i> Update Frequency: {update_frequency}</div>
                    <div class="meta"><i class="th icon"></i> Region Data Availability: {region_data}</div>
                </div>
            </div>"""

    return table_scorecard


def safe_html(value):
    if pd.isna(value):
        return ""
    return escape(str(value), quote=True)


def safe_url(value):
    if pd.isna(value):
        return "#"

    url = str(value).strip()
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        return "#"

    return escape(url, quote=True)


def format_number(value):
    if pd.isna(value) or not math.isfinite(float(value)):
        return "n/a"
    return f"{float(value):,.2f}"


def format_percentage(value):
    if pd.isna(value) or not math.isfinite(float(value)):
        return "n/a"
    return f"{float(value):.2f}%"


def color_percentage(value):
    if pd.isna(value) or not math.isfinite(float(value)):
        return "#66736f"
    if value < 0:
        return "red"
    else:
        return "green"


def header_bg(continent):
    return CONTINENT_COLORS.get(continent, "#BAD2DE")  # A soft warm default color


if __name__ == "__main__":
    main()
