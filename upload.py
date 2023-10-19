import subprocess
import pandas as pd
import os
import ast
import math
import json
from datetime import datetime

global_path = '/data/xuanrenSong/CM_Power_Website'
file_path = os.path.join(global_path, 'data')
tools_path = os.path.join(global_path, 'tools')
# stacked_area_path = os.path.join(tools_path, 'stacked_area_chart')
line_path = os.path.join(tools_path, 'line_chart')
stacked_area_path = os.path.join(tools_path, 'stacked_area_chart')

country_list = ['Australia', 'Brazil', 'Chile', 'China',
                'EU27&UK', 'France', 'Germany',
                'India', 'Italy', 'Japan', 'Mexico', 'New Zealand',
                'Russia', 'South Africa', 'Spain',
                'Turkey', 'United Kingdom', 'United States', 'Bolivia', 'Bangladesh']

categories = {
    'Fossil': ['coal', 'gas', 'oil'],
    'Nuclear': ['nuclear'],
    'Renewables': ['solar', 'wind', 'other', 'hydro']
}

sub_category = ['total', 'coal', 'gas', 'oil', 'nuclear', 'hydro', 'wind', 'solar', 'other', 'fossil', 'renewables']

COLORS = {
    "coal": "#A3A090",
    "oil": "#D4A58F",
    "gas": "#B6A1D4",
    "hydro": "#89C5C8",
    "nuclear": "#98D4A1",
    "other": "#E8ACBF",
    "solar": "#FDDCA3",
    "wind": "#AED3DE"
}


def main():
    # 先更新数据
    process_data()
    # Usage:
    git_push(global_path)


def process_data():
    df = pd.read_csv('/data/xuanrenSong/CM_Power_Database/data/global/Global_PM_corT.csv')

    df['date'] = pd.to_datetime(df['date'], format='%d/%m/%Y')
    df = pd.pivot_table(df, index=['country', 'date'], values='value', columns='sector').reset_index()
    df.columns = ['country', 'date', 'coal', 'gas', 'hydro', 'nuclear', 'oil', 'other', 'solar', 'wind']
    df['total'] = df.sum(axis=1, numeric_only=True)
    df['fossil'] = df[['coal', 'gas', 'oil']].sum(axis=1)
    df['renewables'] = df[['hydro', 'other', 'solar', 'wind']].sum(axis=1)

    df['country'] = df['country'].str.replace('EU27 & UK', 'EU27&UK')
    df['country'] = df['country'].replace('UK', 'United Kingdom')
    df['country'] = df['country'].str.replace('US', 'United States')
    df = df[df['country'].isin(country_list)].reset_index(drop=True)

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
    df.to_csv(os.path.join(file_path, 'data_for_download.csv'), index=False, encoding='utf_8_sig')

    # 再输出一版给line图用的
    df_7mean.to_csv(os.path.join(file_path, 'data_for_line_chart.csv'), index=False, encoding='utf_8_sig')

    # 再输出一版给stacked area用的
    process_stacked_area_data(df_7mean)

    # 再计算一版散点图用的
    df = load_power_data(df)
    df_iea = load_iea_data()
    df_filtered = prepare_comparison_data(df, df_iea)

    df_filtered.to_csv(os.path.join(file_path, 'data_for_scatter_plot.csv'), index=False, encoding='utf_8_sig')


def process_line_data(dataframe):
    # Grouping by country and summing the values for the specific type
    for category_name in sub_category:
        type_sum = dataframe[dataframe['type'] == category_name].groupby('country')['value'].sum()

        # Sorting the values in descending order and getting the country names
        sorted_countries = type_sum.sort_values(ascending=False).index.tolist()

        num_countries = len(sorted_countries)

        # 定义全局设置
        # 动态计算行数和列数
        COLS = 4

        # 计算所需的行数以容纳所有国家，每行4列
        ROWS = int(math.ceil(num_countries / COLS))
        WIDTH = 100 / COLS
        HEIGHT = 92 / ROWS

        ROWS_PER_GRID = math.ceil(len(sorted_countries) / COLS)
        PLOT_HEIGHT = 200  # 根据需要进行调整

        # 调整间距
        WIDTH_ADJUSTMENT = 0.8  # 增加或减少以调整水平间距
        HEIGHT_ADJUSTMENT = 1.0  # 增加或减少以调整垂直间距

        # 格式化日期以用于 x 轴
        formatted_dates = dataframe['date'].dt.strftime('%b-%d').drop_duplicates().tolist()

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
            "series": []
        }

        # 创建存储每年颜色的字典
        unique_years_all = dataframe['year'].unique()
        colors_for_years = dict(zip(unique_years_all, get_line_colors(unique_years_all)))

        # 创建图表的网格
        for idx, country in enumerate(sorted_countries):

            # 创建网格并进行间距调整
            option["grid"].append({
                "top": f"{HEIGHT * (idx // COLS) + HEIGHT_ADJUSTMENT + 10}%",
                "left": f"{WIDTH * (idx % COLS) + WIDTH_ADJUSTMENT}%",
                "width": f"{WIDTH - 2.0 * WIDTH_ADJUSTMENT}%",
                "height": f"{HEIGHT - 4.0 * HEIGHT_ADJUSTMENT}%",
                "containLabel": True
            })

            # 过滤当前国家的数据
            country_data = dataframe[dataframe['country'] == country]
            min_val = float(round(country_data[country_data['type'] == category_name]['value'].min() * 0.95))
            max_val = float(round(country_data[country_data['type'] == category_name]['value'].max() * 1.05))

            # 为网格创建 x 和 y 轴
            option["xAxis"].append({
                "gridIndex": idx,
                "type": "category",
                "data": formatted_dates,
            })

            option["yAxis"].append({
                "gridIndex": idx,
                "type": "value",
                "min": min_val,
                "max": max_val,
                "name": country,
                "nameTextStyle": {
                    "fontSize": 14,  # 根据需要进行调整
                    "fontWeight": "bold",
                    "padding": [0, 0, 0, 100]  # 如果需要，添加一些填充。[上，右，下，左]
                }
            })

            # 为每年生成系列数据
            unique_years = country_data['year'].unique()
            for year in unique_years:
                year_data = country_data[country_data['year'] == year]
                option["series"].append({
                    "name": str(year),
                    "type": "line",
                    "xAxisIndex": idx,
                    "yAxisIndex": idx,
                    "data": year_data[year_data['type'] == category_name]['value'].tolist(),
                    "itemStyle": {
                        "color": colors_for_years[year],
                        "opacity": 0.2  # default opacity for all lines
                    },
                    "emphasis": {  # Add this block for emphasis styling
                        "lineStyle": {
                            "width": 4
                        },
                        "itemStyle": {
                            "opacity": 1
                        }
                    },
                    "selectedMode": "single",  # Add this line to allow single line selection
                })

        option["legend"] = {
            "data": [{"name": str(year), "icon": "circle", "textStyle": {"color": colors_for_years[year]}} for year in
                     unique_years_all],
            "left": 'center',
            "orient": "horizontal",
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
        }

        # 输出json
        with open(os.path.join(line_path, f'{category_name}.json'), 'w') as config_file:
            json.dump({
                "option": option,
                "ROWS_PER_GRID": ROWS_PER_GRID,
                "PLOT_HEIGHT": PLOT_HEIGHT
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
        PLOT_HEIGHT = 200  # 根据需要进行调整

        WIDTH_ADJUSTMENT = 0.8
        HEIGHT_ADJUSTMENT = 1.0

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
                "top": f"{HEIGHT * (idx // COLS) + HEIGHT_ADJUSTMENT + 8}%",  # At the top of the grid
                "z": 100,  # Place it above other elements
                "style": {
                    "text": f"{country} - {selected_category} {ratio_sum_str}",
                    "fontSize": 14,
                    "fontWeight": "bold",
                    "textAlign": "center"  # Center align text
                }
            })

            option["grid"].append({
                "top": f"{HEIGHT * (idx // COLS) + HEIGHT_ADJUSTMENT + 10}%",
                "left": f"{WIDTH * (idx % COLS) + WIDTH_ADJUSTMENT}%",
                "width": f"{WIDTH - 2 * WIDTH_ADJUSTMENT}%",
                "height": f"{HEIGHT - 4 * HEIGHT_ADJUSTMENT}%",
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
    df_iea['renewables'] = df_iea[['nuclear', 'hydro', 'solar', 'wind', 'other']].sum(axis=1)

    return df_iea.melt(id_vars=['country', 'year', 'month'], var_name='type', value_name='iea')


def prepare_comparison_data(df, df_iea):
    df_compare = pd.merge(df, df_iea)
    df_compare['value'] = round(df_compare['value'] / 1000, 2)
    df_compare['iea'] = round(df_compare['iea'] / 1000, 2)
    return df_compare


def git_push(repo_path, commit_message="Automated commit"):
    try:
        os.chdir(repo_path)

        # Pull the latest changes from the remote repository
        subprocess.run(['git', 'pull'])

        subprocess.run(['git', 'add', '--all'])
        subprocess.run(['git', 'commit', '-m', commit_message])

        # Get the current branch name
        current_branch = subprocess.getoutput('git rev-parse --abbrev-ref HEAD')
        subprocess.run(['git', 'push', 'origin', current_branch])

        print("Changes pulled and pushed successfully.")
    except Exception as e:
        print(f"Error: {e}")


def map_to_category(type_):
    for category, types in categories.items():
        if type_ in types:
            return category
    return None


def get_line_colors(years_list):
    # Base colors
    blue_rgb = (76, 164, 224)  # Macaron Blue
    orange_rgb = (186, 97, 93)  # Macaron Orange
    black_color = 'rgb(0, 0, 0)'

    current_year = datetime.now().year  # Get the current year

    colors = []

    for year in years_list:
        if year in [2019, 2020]:
            factor = (2020 - year) * 0.3  # Darken by 10% for each year away from 2020
            # factor = clamp(factor, min_factor, max_factor)  # Ensure within range
            adjusted_blue = adjust_lightness(blue_rgb, -factor)
            colors.append(f'rgb{adjusted_blue}')
        elif year == current_year:  # Latest year
            colors.append(black_color)
        else:
            factor = (current_year - year) * 0.4  # Lighten by 20% for each year away from the current year

            adjusted_orange = adjust_lightness(orange_rgb, factor)
            colors.append(f'rgb{adjusted_orange}')

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


if __name__ == "__main__":
    main()
